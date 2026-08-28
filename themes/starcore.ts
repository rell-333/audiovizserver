import { beatPulse } from '@/lib/beatPulse';
import { sectionTier } from '@/lib/pixi/sectionMapping';
import { approach, decay, clamp01, easeOutCubic } from '@/lib/smoothing';
import { PALETTE, paletteRgba } from '@/lib/palette';
import { ensureBuffer, type ScratchBuffer } from '@/lib/scratchBuffer';
import { drawGlyph, GLYPH_KINDS, type GlyphKind } from '@/lib/starGlyphs';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const STARCORE_LABEL = 'Starcore';

const CREAM: [number, number, number] = [244, 236, 223];
const INK: [number, number, number] = [10, 7, 18];
const DENSITIES = [26, 42, 64];

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r}, ${g}, ${bl})`;
}

interface Star {
    ring: number; // 0-1, distance from centre as a fraction of radius
    angle: number;
    size: number; // base size in px at reference scale
    kind: GlyphKind;
    color: number;
    band: 0 | 1 | 2;
    twinkle: number;
    twinkleSpeed: number;
    outline: boolean; // ☆ vs ★
    pop: number; // beat spike
    // burst mode state
    flungR: number;
    flungV: number;
    // rain mode state
    rainY: number;
    rainV: number;
}

interface Mods {
    scale: number;
    spinRate: number;
    ringSpread: number; // multiplies ring radii
    sizeMul: number;
    colorAdd: number;
    bgDark: number;
    web: number; // constellation line strength
    burst: number; // 0-1 fling amount
    rain: number; // 0-1
    mega: number; // giant centre glyph
    mirror: number;
    feedback: number;
    feedbackScale: number;
    invert: number;
    flash: number;
    shakeX: number;
    shakeY: number;
}

function freshMods(): Mods {
    return {
        scale: 1,
        spinRate: 0,
        ringSpread: 1,
        sizeMul: 1,
        colorAdd: 0,
        bgDark: 0,
        web: 0,
        burst: 0,
        rain: 0,
        mega: 0,
        mirror: 0,
        feedback: 0,
        feedbackScale: 1.05,
        invert: 0,
        flash: 0,
        shakeX: 0,
        shakeY: 0
    };
}

interface ActiveMode {
    def: ModeDef;
    elapsed: number;
    state: Record<string, number>;
}

interface ModeCtx {
    data: VisualizerData;
    dt: number;
    beatTick: boolean;
    beatIndex: number;
    energy: number;
}

interface ModeDef {
    key: string;
    id: string;
    name: string;
    apply(m: ActiveMode, mods: Mods, c: ModeCtx): void;
}

const MODES: ModeDef[] = [
    {
        key: '1',
        id: 'web',
        name: 'web',
        // Thin lines link nearby stars into a shifting constellation. The
        // quietest mode - keeps the minimal feel while adding structure.
        apply(m, mods, c) {
            mods.web = Math.max(mods.web, clamp01(m.elapsed / 1.2) * (0.5 + c.energy * 0.5));
        }
    },
    {
        key: '2',
        id: 'orbit',
        name: 'orbit',
        // Rings counter-rotate and breathe hard, so the whole constellation
        // opens and closes.
        apply(m, mods, c) {
            const ramp = clamp01(m.elapsed / 2);
            mods.spinRate += 0.9 * ramp;
            mods.ringSpread *= 1 + Math.sin(m.elapsed * 0.7) * 0.35 * ramp + c.data.bassNorm * 0.2;
            mods.sizeMul *= 1 + c.data.midNorm * 0.25;
        }
    },
    {
        key: '3',
        id: 'burst',
        name: 'burst',
        // Every beat flings the whole constellation outward; it springs back
        // before the next one. Very physical.
        apply(m, mods, c) {
            if (m.state.f === undefined) m.state.f = 0;
            if (c.beatTick) m.state.f = 1;
            m.state.f = Math.max(0, m.state.f - c.dt * 2.4);
            mods.burst = Math.max(mods.burst, m.state.f);
            mods.flash = Math.max(mods.flash, m.state.f * 0.2);
            mods.sizeMul *= 1 + m.state.f * 0.5;
        }
    },
    {
        key: '4',
        id: 'rain',
        name: 'rain',
        // Stars break formation and stream downward like sparkle rain.
        apply(m, mods, c) {
            mods.rain = Math.max(mods.rain, clamp01(m.elapsed / 1.5));
            mods.sizeMul *= 0.85;
            mods.spinRate += 0.15;
            void c;
        }
    },
    {
        key: '5',
        id: 'mega',
        name: 'mega',
        // A giant glyph sits behind everything and swaps shape every beat,
        // scaling with the kick. Turns the screen into a poster.
        apply(m, mods, c) {
            if (m.state.k === undefined) m.state.k = 0;
            if (c.beatTick) {
                m.state.k = Math.floor(Math.random() * GLYPH_KINDS.length);
                m.state.hit = 1;
            }
            m.state.hit = Math.max(0, (m.state.hit || 0) - c.dt * 2.6);
            mods.mega = Math.max(mods.mega, 0.6 + (m.state.hit || 0) * 0.4);
        }
    },
    {
        key: '6',
        id: 'kaleido',
        name: 'kaleido',
        apply(m, mods, c) {
            if (m.state.segs === undefined) m.state.segs = 6;
            if (c.beatTick && c.beatIndex % 4 === 0) {
                const options = [4, 6, 8];
                m.state.segs = options[Math.floor(Math.random() * options.length)];
            }
            mods.mirror = m.state.segs;
            // Note this theme mirrors at the geometry level, not the image
            // level: the star field is redrawn under rotated/reflected
            // transforms. On a sparse constellation an image-space mirror just
            // reflects empty paper, whereas replicating the stars themselves
            // builds a dense, perfectly crisp mandala - and it's cheaper than
            // a full-frame blit per segment.
            mods.ringSpread *= 0.78;
        }
    },
    {
        key: '7',
        id: 'tunnel',
        name: 'tunnel',
        apply(m, mods, c) {
            if (m.state.dir === undefined) m.state.dir = 1;
            if (c.beatTick && c.beatIndex % 8 === 0) m.state.dir = m.state.dir > 0 ? -1 : 1;
            mods.feedback = Math.max(mods.feedback, 0.8 * clamp01(m.elapsed / 1.2));
            mods.feedbackScale = m.state.dir > 0 ? 1.05 : 0.96;
        }
    },
    {
        key: '8',
        id: 'flip',
        name: 'flip',
        // Blackout + inversion cutting on the beat. On cream paper this
        // reads as a hard cut between a print and its negative.
        apply(m, mods, c) {
            if (m.state.p === undefined) m.state.p = 0;
            if (c.beatTick) {
                m.state.p = m.state.p ? 0 : 1;
                m.state.hit = 1;
            }
            m.state.hit = Math.max(0, (m.state.hit || 0) - c.dt * 6);
            mods.bgDark = Math.max(mods.bgDark, m.state.p ? 1 : 0);
            mods.invert = Math.max(mods.invert, c.energy > 0.75 && m.state.p ? 1 : 0);
            mods.flash = Math.max(mods.flash, (m.state.hit || 0) * 0.5);
            mods.shakeX += (Math.random() - 0.5) * (m.state.hit || 0) * 14;
            mods.shakeY += (Math.random() - 0.5) * (m.state.hit || 0) * 14;
        }
    }
];

interface Scene {
    name: string;
    enter: number;
    modes: string[];
}

const SCENES: Scene[] = [
    { name: 'still', enter: 0.0, modes: ['web'] },
    { name: 'drift', enter: 0.32, modes: ['web', 'orbit'] },
    { name: 'lift', enter: 0.52, modes: ['orbit', 'burst'] },
    { name: 'peak', enter: 0.7, modes: ['orbit', 'burst', 'mega', 'flip'] },
    { name: 'blowout', enter: 0.86, modes: ['orbit', 'burst', 'mega', 'flip', 'kaleido'] }
];

const SCENE_HYSTERESIS = 0.06;
const SCENE_MIN_DWELL = 6;

// "Starcore": a minimal typographic constellation. Mostly empty cream
// paper with a scattered set of star glyphs arranged on slowly turning
// rings, each twinkling and scaled by its own frequency band. The base
// state is deliberately calm and graphic; the modes are what take it
// somewhere else.
export function createStarcoreTheme(): VisualizerTheme {
    let stars: Star[] = [];
    let densityIndex = 1;
    let latest: VisualizerData | null = null;

    let rotation = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothTreble = 0;
    let energy = 0;

    let prevBeatPhase = 0;
    let beatIndex = 0;
    let colorOffset = 0;
    let megaKind = 0;

    let scaleCurrent = 1;
    let modeSpin = 0;

    const active = new Map<string, ActiveMode>();
    let mods: Mods = freshMods();

    let autoOn = false;
    let autoScene = 0;
    let autoDwell = 0;
    let lastSection: string | undefined;
    let sectionEngaged = false;

    let echoBuf: ScratchBuffer | null = null;

    let hintText = '';
    let hintTimer = 0;
    let seeded = false;

    function flash(text: string) {
        hintText = text;
        hintTimer = 1.6;
    }

    function seed() {
        const count = DENSITIES[densityIndex];
        stars = [];
        for (let i = 0; i < count; i++) {
            // Spread across rings, biased outward so the centre stays open -
            // that negative space is what keeps it feeling minimal.
            const ring = 0.18 + Math.pow(Math.random(), 0.7) * 0.82;
            stars.push({
                ring,
                angle: Math.random() * Math.PI * 2,
                size: 4 + Math.random() * 16,
                kind: GLYPH_KINDS[Math.floor(Math.random() * GLYPH_KINDS.length)],
                color: Math.floor(Math.random() * PALETTE.length),
                band: (i % 3) as 0 | 1 | 2,
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.6 + Math.random() * 2.2,
                outline: Math.random() > 0.55,
                pop: 0,
                flungR: 0,
                flungV: 0,
                rainY: Math.random(),
                rainV: 0.08 + Math.random() * 0.3
            });
        }
        seeded = true;
    }

    function toggle(def: ModeDef, on?: boolean) {
        const isOn = active.has(def.id);
        const want = on === undefined ? !isOn : on;
        if (want && !isOn) active.set(def.id, { def, elapsed: 0, state: {} });
        else if (!want && isOn) active.delete(def.id);
    }

    function applyScene(index: number) {
        const scene = SCENES[index];
        for (const def of MODES) toggle(def, scene.modes.includes(def.id));
        flash(`auto: ${scene.name}`);
    }

    return {
        label: STARCORE_LABEL,

        keyHelp: [
            ...MODES.map((m) => [m.key, m.name] as [string, string]),
            ['a', 'AUTO (energy)'],
            ['d', 'density'],
            ['0', 'all off']
        ],

        init() {
            seeded = false;
            densityIndex = 1;
            latest = null;
            rotation = 0;
            smoothBass = 0;
            smoothMid = 0;
            smoothTreble = 0;
            energy = 0;
            prevBeatPhase = 0;
            beatIndex = 0;
            colorOffset = 0;
            megaKind = 0;
            scaleCurrent = 1;
            modeSpin = 0;
            active.clear();
            mods = freshMods();
            autoOn = false;
            autoScene = 0;
            autoDwell = 0;
            lastSection = undefined;
            sectionEngaged = false;
            echoBuf = null;
            hintText = '';
            hintTimer = 0;
        },

        onKey(key: string) {
            const def = MODES.find((m) => m.key === key);
            if (def) {
                autoOn = false;
                toggle(def);
                flash(`${def.name} ${active.has(def.id) ? 'on' : 'off'}`);
                return;
            }
            switch (key) {
                case 'a':
                case 'A':
                    autoOn = !autoOn;
                    if (autoOn) {
                        autoDwell = SCENE_MIN_DWELL;
                        applyScene(autoScene);
                    } else flash('auto off');
                    break;
                case 'd':
                case 'D':
                    densityIndex = (densityIndex + 1) % DENSITIES.length;
                    seed();
                    flash(`${DENSITIES[densityIndex]} stars`);
                    break;
                case '0':
                    autoOn = false;
                    active.clear();
                    modeSpin = 0;
                    flash('all off');
                    break;
                default:
                    break;
            }
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            if (!seeded) seed();

            smoothBass = approach(smoothBass, data.bassNorm, 6, dt);
            smoothMid = approach(smoothMid, data.midNorm, 3.5, dt);
            smoothTreble = approach(smoothTreble, data.trebleNorm, 3, dt);

            const instant = (data.bassNorm + data.midNorm + data.trebleNorm) / 3;
            energy = approach(energy, instant * (0.5 + data.intensity * 0.7), 0.5, dt);

            let beatTick = false;
            if (data.beatPhase < prevBeatPhase) {
                beatTick = true;
                beatIndex++;
                if (beatIndex % 4 === 0) colorOffset++;
            }
            prevBeatPhase = data.beatPhase;

            if (lastSection !== undefined && data.section !== lastSection) {
                sectionEngaged = true;
                // Driving Section from Ableton is a clear enough signal of
                // intent that it shouldn't also require a separate 'a' keypress
                // to actually take effect - the first real change turns the
                // director on for you.
                autoOn = true;
            }
            lastSection = data.section;

            autoDwell += dt;

            if (autoOn && sectionEngaged) {
                // Authored automation wins outright, and applies instantly - no
                // dwell/hysteresis, those exist to smooth noisy energy, not to
                // delay a cue you deliberately drew on the timeline.
                const target = sectionTier(data.section, SCENES.length - 1);
                if (target !== null && target !== autoScene) {
                    autoScene = target;
                    autoDwell = 0;
                    applyScene(autoScene);
                }
            } else if (autoOn && autoDwell >= SCENE_MIN_DWELL) {
                let target = autoScene;
                if (autoScene < SCENES.length - 1 && energy >= SCENES[autoScene + 1].enter) target = autoScene + 1;
                else if (autoScene > 0 && energy < SCENES[autoScene].enter - SCENE_HYSTERESIS) target = autoScene - 1;
                if (target !== autoScene) {
                    autoScene = target;
                    autoDwell = 0;
                    applyScene(autoScene);
                }
            }

            const c: ModeCtx = { data, dt, beatTick, beatIndex, energy };
            mods = freshMods();
            for (const mode of active.values()) {
                mode.elapsed += dt;
                mode.def.apply(mode, mods, c);
                if (mode.def.id === 'mega' && mode.state.k !== undefined) megaKind = mode.state.k;
            }

            hintTimer = decay(hintTimer, 1, dt);
            rotation += dt * 0.05;
            modeSpin += mods.spinRate * dt;
            scaleCurrent = approach(scaleCurrent, mods.scale, 8, dt);

            // Per-star motion.
            const bands = [data.bassNorm, data.midNorm, data.trebleNorm];
            for (const s of stars) {
                s.twinkle += s.twinkleSpeed * dt;
                if (beatTick && Math.random() < 0.35) s.pop = 1;
                s.pop = Math.max(0, s.pop - dt * 2.8);

                // Burst: flung outward on the beat, springs back.
                if (mods.burst > 0.01) {
                    const target = mods.burst * 0.55 * (0.5 + (bands[s.band] || 0));
                    s.flungR = approach(s.flungR, target, 9, dt);
                } else {
                    s.flungR = approach(s.flungR, 0, 4, dt);
                }

                // Rain: falls, wrapping at the bottom.
                if (mods.rain > 0.01) {
                    s.rainY += s.rainV * dt * (0.6 + smoothMid * 1.6);
                    if (s.rainY > 1.15) {
                        s.rainY -= 1.3;
                        s.angle = Math.random() * Math.PI * 2;
                    }
                }
            }
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;
            const W = canvas.width;
            const H = canvas.height;
            const pulse = beatPulse(data.beatPhase, 4);
            const dark = clamp01(mods.bgDark);

            ctx.fillStyle = lerpColor(CREAM, INK, dark);
            ctx.fillRect(0, 0, W, H);

            const cx = W / 2 + mods.shakeX;
            const cy = H / 2 + mods.shakeY;
            const radius = Math.min(W, H) * 0.44;
            const sizeRef = Math.min(W, H) / 620;
            const bands = [smoothBass, smoothMid, smoothTreble];
            const paletteAt = (n: number) =>
                PALETTE[((n % PALETTE.length) + PALETTE.length) % PALETTE.length];

            // ---- giant background glyph ----------------------------------
            if (mods.mega > 0.01) {
                const megaSize = Math.min(W, H) * (0.34 + smoothBass * 0.1) * mods.mega;
                drawGlyph(
                    ctx,
                    GLYPH_KINDS[megaKind % GLYPH_KINDS.length],
                    cx,
                    cy,
                    megaSize,
                    rotation * 0.6,
                    paletteRgba(colorOffset + 3, dark > 0.5 ? 0.28 : 0.2),
                    null
                );
            }

            // ---- resolve each star's screen position ---------------------
            // Computed once and reused by both the web lines and the glyph
            // pass, so the two can never disagree about where a star is.
            const px = new Array<number>(stars.length);
            const py = new Array<number>(stars.length);
            const psize = new Array<number>(stars.length);

            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                const band = bands[s.band] || 0;
                const ringR = (s.ring + s.flungR) * radius * mods.ringSpread * scaleCurrent;
                const a = s.angle + rotation + modeSpin * (0.6 + s.ring * 0.8);

                let x = cx + Math.cos(a) * ringR;
                let y = cy + Math.sin(a) * ringR;

                // Rain overrides the vertical position, blending in so toggling
                // it doesn't teleport everything.
                if (mods.rain > 0.01) {
                    const rainYPos = (s.rainY % 1.3) * H * 1.15 - H * 0.075;
                    const rainXPos = cx + Math.cos(s.angle) * radius * 0.9 * mods.ringSpread;
                    x = x + (rainXPos - x) * mods.rain;
                    y = y + (rainYPos - y) * mods.rain;
                }

                const twinkle = 0.55 + 0.45 * Math.sin(s.twinkle);
                const size =
                    s.size * sizeRef * mods.sizeMul * scaleCurrent *
                    (0.55 + band * 0.9 + s.pop * 0.7 + pulse * 0.15) * twinkle;

                px[i] = x;
                py[i] = y;
                psize[i] = size;
            }

            // ---- draw the field (web + stars) ------------------------------
            // Wrapped in a function so kaleido can replicate it under rotated
            // and mirrored transforms without recomputing any positions.
            const drawField = () => {
                if (mods.web > 0.01) {
                    const maxDist = Math.min(W, H) * 0.19;
                    const maxDistSq = maxDist * maxDist;
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = dark > 0.5
                        ? `rgba(255,255,255,${0.22 * mods.web})`
                        : `rgba(30, 22, 40, ${0.3 * mods.web})`;
                    ctx.beginPath();
                    // Each star only looks ahead in the list, so every pair is
                    // considered once rather than twice.
                    for (let i = 0; i < stars.length; i++) {
                        for (let j = i + 1; j < stars.length; j++) {
                            const dx = px[i] - px[j];
                            const dy = py[i] - py[j];
                            const d2 = dx * dx + dy * dy;
                            if (d2 > maxDistSq) continue;
                            ctx.moveTo(px[i], py[i]);
                            ctx.lineTo(px[j], py[j]);
                        }
                    }
                    ctx.stroke();
                }

                for (let i = 0; i < stars.length; i++) {
                    const s2 = stars[i];
                    const color = paletteRgba(s2.color + colorOffset + mods.colorAdd, 1);
                    const rot = s2.twinkle * 0.25 + rotation * (s2.outline ? -0.6 : 0.4);
                    if (s2.outline) {
                        drawGlyph(ctx, s2.kind, px[i], py[i], psize[i], rot, null, color, Math.max(1, psize[i] * 0.11));
                    } else {
                        drawGlyph(ctx, s2.kind, px[i], py[i], psize[i], rot, color, null);
                    }
                }
            };

            if (mods.mirror >= 3) {
                const segs = Math.round(mods.mirror);
                for (let seg = 0; seg < segs; seg++) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate((seg * Math.PI * 2) / segs);
                    if (seg % 2 === 1) ctx.scale(-1, 1);
                    ctx.translate(-cx, -cy);
                    drawField();
                    ctx.restore();
                }
            } else {
                drawField();
            }

            // ---- centre mark ------------------------------------------------
            const centreSize = Math.min(W, H) * (0.028 + smoothBass * 0.03 + pulse * 0.012) * scaleCurrent;
            drawGlyph(
                ctx,
                'sparkle4',
                cx,
                cy,
                centreSize,
                -rotation * 1.6,
                paletteRgba(colorOffset + 2, 1),
                null
            );

            // ---- post: feedback echo ---------------------------------------
            if (mods.feedback > 0.01 && echoBuf) {
                const s = mods.feedbackScale;
                ctx.save();
                ctx.globalAlpha = mods.feedback;
                ctx.translate(W / 2, H / 2);
                ctx.scale(s, s);
                ctx.rotate(0.01);
                // Nearest-neighbour: bilinear filtering on a full-frame scaled
                // blit is by far the most expensive part of an effect like this,
                // and the echo is overdrawn every frame anyway.
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(echoBuf.source, -W / 2, -H / 2, W, H);
                ctx.imageSmoothingEnabled = true;
                ctx.restore();
                ctx.globalAlpha = 1;
            }

            // ---- post: invert / flash --------------------------------------
            if (mods.invert > 0.5) {
                ctx.globalCompositeOperation = 'difference';
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                ctx.globalCompositeOperation = 'source-over';
            }
            if (mods.flash > 0.01) {
                ctx.fillStyle = `rgba(255,255,255,${Math.min(1, mods.flash)})`;
                ctx.fillRect(0, 0, W, H);
            }

            // ---- store frame for the echo -----------------------------------
            if (mods.feedback > 0.01) {
                echoBuf = ensureBuffer(echoBuf, W, H);
                if (echoBuf) {
                    echoBuf.ctx.clearRect(0, 0, W, H);
                    echoBuf.ctx.drawImage(canvas, 0, 0);
                }
            } else if (echoBuf) {
                echoBuf = null;
            }

            // ---- hud ---------------------------------------------------------
            const labels: string[] = [];
            if (autoOn) labels.push(`AUTO (${sectionEngaged ? 'section' : 'energy'}) ${SCENES[autoScene].name}`);
            for (const m of active.values()) labels.push(m.def.name);

            if (labels.length || hintTimer > 0.01) {
                const onInk = dark > 0.5 || mods.invert > 0.5;
                ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.fillStyle = onInk ? 'rgba(255,255,255,0.8)' : 'rgba(20,16,12,0.7)';
                if (labels.length) ctx.fillText(labels.join('  ·  '), 22, H - 44);
                if (hintTimer > 0.01) {
                    ctx.globalAlpha = Math.min(1, hintTimer / 0.4);
                    ctx.fillText(hintText, 22, H - 22);
                    ctx.globalAlpha = 1;
                }
            }
        }
    };
}
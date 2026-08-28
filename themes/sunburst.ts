import { beatPulse } from '@/lib/beatPulse';
import { approach, decay, easeOutCubic, clamp01 } from '@/lib/smoothing';
import { PALETTE, paletteRgba } from '@/lib/palette';
import { ensureBuffer, type ScratchBuffer } from '@/lib/scratchBuffer';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const SUNBURST_LABEL = 'Sunburst';

const CREAM: [number, number, number] = [244, 236, 223];
const INK: [number, number, number] = [8, 6, 14];
const RAY_COUNTS = [8, 14, 20, 30];

// Precomputed pow(t, 1.35) at 1/32 intervals. The curl exponent is the
// hottest maths in the draw loop and always takes the same fixed
// fractions, so a table removes hundreds of Math.pow calls per frame.
const CURL_POW: number[] = Array.from({ length: 33 }, (_, i) => Math.pow(i / 32, 1.35));

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r}, ${g}, ${bl})`;
}

// ---------------------------------------------------------------------
// MODES
//
// Every mode is a toggle, and any number can run at once - they compose.
// A mode writes into the shared Mods struct each frame; numeric fields
// accumulate (multiply or add) so stacking vortex + kaleido + strobe
// gives you something none of them do alone.
//
// Mods split into two groups: geometry, which changes how the burst is
// built, and post, which reprocesses the finished frame (mirroring,
// feedback echo, inversion, slice glitch). The post effects are what
// actually change the *view* rather than just the intensity, which is
// the point - a whole track in one framing gets boring fast.
// ---------------------------------------------------------------------

interface Mods {
    // geometry
    zoomMul: number;
    spinRate: number;
    twistAdd: number;
    widthMul: number;
    rayOverride: number | null;
    colorAdd: number;
    bgDark: number; // 0 = cream paper, 1 = blackout
    // post
    flash: number;
    shakeX: number;
    shakeY: number;
    whip: number; // sudden rotation offset
    mirror: number; // 0 = off, else segment count
    feedback: number; // 0-1 echo strength
    feedbackScale: number; // >1 pushes echoes outward, <1 inward
    invert: number; // 0-1
    slice: number; // 0-1 glitch displacement
}

function freshMods(): Mods {
    return {
        zoomMul: 1,
        spinRate: 0,
        twistAdd: 0,
        widthMul: 1,
        rayOverride: null,
        colorAdd: 0,
        bgDark: 0,
        flash: 0,
        shakeX: 0,
        shakeY: 0,
        whip: 0,
        mirror: 0,
        feedback: 0,
        feedbackScale: 1.04,
        invert: 0,
        slice: 0
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
        id: 'strobe',
        name: 'strobe',
        // Hard cuts. Background slams between paper and blackout on every
        // beat, palette jumps, white hits on the offbeat. The single most
        // "rave" thing here.
        apply(m, mods, c) {
            if (m.state.hit === undefined) m.state.hit = 0;
            if (c.beatTick) {
                m.state.hit = 1;
                m.state.parity = m.state.parity ? 0 : 1;
                m.state.color = (m.state.color || 0) + 2;
            }
            m.state.hit = Math.max(0, m.state.hit - c.dt * 7);

            mods.bgDark = Math.max(mods.bgDark, m.state.parity ? 1 : 0);
            mods.colorAdd += Math.round(m.state.color || 0);
            mods.flash = Math.max(mods.flash, m.state.hit * 0.75);
            mods.zoomMul *= 1 + m.state.hit * 0.1;
        }
    },
    {
        key: '2',
        id: 'kaleido',
        name: 'kaleido',
        // Mirrors the frame into a mandala. Segment count steps with the
        // music, so the symmetry itself becomes the rhythm.
        apply(m, mods, c) {
            if (m.state.segs === undefined) m.state.segs = 6;
            if (c.beatTick && c.beatIndex % 4 === 0) {
                // Each segment costs a full-frame blit, so this stays small.
                const options = [4, 6, 8];
                m.state.segs = options[Math.floor(Math.random() * options.length)];
            }
            mods.mirror = m.state.segs;
            // Pull the source in a little so mirrored seams read cleanly.
            mods.zoomMul *= 0.92;
        }
    },
    {
        key: '3',
        id: 'tunnel',
        name: 'tunnel',
        // Frame feedback: each frame echoes the last one, scaled. Direction
        // flips every 8 beats so you fly in, then out. Infinite zoom.
        apply(m, mods, c) {
            if (m.state.dir === undefined) m.state.dir = 1;
            if (c.beatTick && c.beatIndex % 8 === 0) m.state.dir = m.state.dir > 0 ? -1 : 1;

            const ramp = clamp01(m.elapsed / 1.2);
            mods.feedback = Math.max(mods.feedback, 0.82 * ramp);
            mods.feedbackScale = m.state.dir > 0 ? 1.055 : 0.955;
            mods.spinRate += 0.25 * m.state.dir;
        }
    },
    {
        key: '4',
        id: 'quake',
        name: 'quake',
        // Camera shake, whip rotation and slice glitch on every beat. Makes
        // the whole frame feel physically hit.
        apply(m, mods, c) {
            if (m.state.hit === undefined) m.state.hit = 0;
            if (c.beatTick) {
                m.state.hit = 1;
                m.state.whipDir = Math.random() > 0.5 ? 1 : -1;
            }
            m.state.hit = Math.max(0, m.state.hit - c.dt * 4.5);

            const h = m.state.hit;
            mods.shakeX += (Math.random() - 0.5) * h * 46;
            mods.shakeY += (Math.random() - 0.5) * h * 46;
            mods.whip += (m.state.whipDir || 1) * h * 0.16;
            mods.slice = Math.max(mods.slice, h * 0.9);
            mods.zoomMul *= 1 + h * 0.07;
        }
    },
    {
        key: '5',
        id: 'negative',
        name: 'negative',
        // Colour inversion flickering against the beat. Cheap trick, looks
        // incredible on a big screen.
        apply(m, mods, c) {
            if (m.state.on === undefined) m.state.on = 0;
            if (c.beatTick) m.state.on = m.state.on ? 0 : 1;
            // Also flicker inside the beat on high energy.
            const flicker = c.energy > 0.6 && Math.sin(m.elapsed * 26) > 0.4 ? 1 : 0;
            mods.invert = Math.max(mods.invert, m.state.on || flicker);
        }
    },
    {
        key: '6',
        id: 'vortex',
        name: 'vortex',
        // Curl winds tighter forever, spin accelerating with it. Never
        // settles - it just keeps screwing inward.
        apply(m, mods) {
            const ramp = clamp01(m.elapsed / 3);
            const breathe = 0.75 + 0.35 * Math.sin(m.elapsed * 0.6);
            mods.twistAdd += 4.4 * ramp * breathe;
            mods.spinRate += 2.1 * ramp;
            mods.zoomMul *= 1 + 0.16 * Math.sin(m.elapsed * 0.45) * ramp;
            mods.widthMul *= 1 - 0.22 * ramp;
        }
    },
    {
        key: '7',
        id: 'swarm',
        name: 'swarm',
        // Ray count surges with the music, from a handful to a dense fan and
        // back. Detail keeps appearing and dissolving.
        apply(m, mods, c) {
            const surge = 0.5 + 0.5 * Math.sin(m.elapsed * 0.9);
            const target = 8 + surge * 26 + c.data.bassNorm * 22;
            m.state.rays = m.state.rays === undefined ? target : approach(m.state.rays, target, 3, c.dt);
            mods.rayOverride = Math.max(6, Math.round(m.state.rays));
            mods.widthMul *= 0.8;
            mods.spinRate += 0.5;
        }
    },
    {
        key: '8',
        id: 'drop',
        name: 'drop',
        // An 8-beat loop: creeps inward, tightening, then SLAMS back out on
        // the downbeat with a white hit. Loops for as long as it's on, so it
        // stays locked to the phrase.
        apply(m, mods, c) {
            if (m.state.slam === undefined) m.state.slam = 0;
            if (c.beatTick && c.beatIndex % 8 === 0) m.state.slam = 1;
            m.state.slam = Math.max(0, m.state.slam - c.dt * 1.6);

            // Build: position within the 8-beat phrase drives a rising zoom.
            const phraseBeat = ((c.beatIndex % 8) + c.data.beatPhase) / 8;
            const build = easeOutCubic(phraseBeat);

            const slamOut = m.state.slam;
            mods.zoomMul *= (1 + build * 1.5) * (1 - slamOut * 0.62);
            mods.twistAdd += build * 1.6;
            mods.flash = Math.max(mods.flash, slamOut * 0.85);
            mods.bgDark = Math.max(mods.bgDark, slamOut * 0.9);
            mods.spinRate += build * 1.2;
        }
    }
];

// ---------------------------------------------------------------------
// AUTO DIRECTOR
//
// Watches the smoothed energy of the mix and swaps the whole look when
// the track moves between sections - breakdown, groove, build, peak. The
// dwell time and hysteresis stop it flickering between scenes on a
// borderline energy level.
// ---------------------------------------------------------------------

interface Scene {
    name: string;
    enter: number; // energy needed to move up into this scene
    modes: string[];
}

const SCENES: Scene[] = [
    { name: 'breakdown', enter: 0.0, modes: ['tunnel'] },
    { name: 'groove', enter: 0.34, modes: ['vortex'] },
    { name: 'build', enter: 0.55, modes: ['vortex', 'kaleido'] },
    { name: 'peak', enter: 0.72, modes: ['strobe', 'quake', 'kaleido'] },
    { name: 'blowout', enter: 0.87, modes: ['strobe', 'quake', 'kaleido', 'negative', 'swarm'] }
];

const SCENE_HYSTERESIS = 0.06;
const SCENE_MIN_DWELL = 6; // seconds

export function createSunburstTheme(): VisualizerTheme {
    let rotation = 0;
    let centreDrift = 0;
    let latest: VisualizerData | null = null;

    let smoothBass = 0;
    let smoothMid = 0;
    let smoothTreble = 0;
    let energy = 0;
    let twist = 0.6;

    let prevBeatPhase = 0;
    let beatIndex = 0;
    let colorOffset = 0;

    let rayCountIndex = 1;
    let zoomCurrent = 1;
    let modeSpin = 0;
    let direction = 1;

    const active = new Map<string, ActiveMode>();
    let mods: Mods = freshMods();

    let autoOn = false;
    let autoScene = 0;
    let autoDwell = 0;

    let echoBuf: ScratchBuffer | null = null;
    let workBuf: ScratchBuffer | null = null;

    let hintText = '';
    let hintTimer = 0;

    function flash(text: string) {
        hintText = text;
        hintTimer = 1.6;
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

    function wedgePath(
        ctx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        a0: number,
        a1: number,
        maxR: number,
        curl: number
    ) {
        const steps = Math.max(4, Math.min(16, Math.ceil(4 + Math.abs(curl) * 5)));
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const r = t * maxR;
            const a = a0 + curl * CURL_POW[(t * 32) | 0];
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        for (let s = steps; s >= 0; s--) {
            const t = s / steps;
            const r = t * maxR;
            const a = a1 + curl * CURL_POW[(t * 32) | 0];
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
    }

    return {
        label: SUNBURST_LABEL,

        keyHelp: [
            ...MODES.map((m) => [m.key, m.name] as [string, string]),
            ['a', 'AUTO (energy)'],
            ['9', 'reverse'],
            ['0', 'all off'],
            ['r', 'ray count']
        ],

        init() {
            rotation = 0;
            centreDrift = 0;
            latest = null;
            smoothBass = 0;
            smoothMid = 0;
            smoothTreble = 0;
            energy = 0;
            twist = 0.6;
            prevBeatPhase = 0;
            beatIndex = 0;
            colorOffset = 0;
            rayCountIndex = 1;
            zoomCurrent = 1;
            modeSpin = 0;
            direction = 1;
            active.clear();
            mods = freshMods();
            autoOn = false;
            autoScene = 0;
            autoDwell = 0;
            echoBuf = null;
            workBuf = null;
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
                    } else {
                        flash('auto off');
                    }
                    break;
                case '9':
                    direction *= -1;
                    flash('reverse');
                    break;
                case '0':
                    autoOn = false;
                    active.clear();
                    modeSpin = 0;
                    direction = 1;
                    flash('all off');
                    break;
                case 'r':
                case 'R':
                    rayCountIndex = (rayCountIndex + 1) % RAY_COUNTS.length;
                    flash(`${RAY_COUNTS[rayCountIndex]} rays`);
                    break;
                default:
                    break;
            }
        },

        update(data: VisualizerData, dt: number) {
            latest = data;

            smoothBass = approach(smoothBass, data.bassNorm, 6, dt);
            smoothMid = approach(smoothMid, data.midNorm, 3, dt);
            smoothTreble = approach(smoothTreble, data.trebleNorm, 2.5, dt);

            // Section energy: deliberately slow, so it tracks the arrangement
            // rather than individual hits.
            const instant = (data.bassNorm + data.midNorm + data.trebleNorm) / 3;
            energy = approach(energy, instant * (0.5 + data.intensity * 0.7), 0.5, dt);

            let beatTick = false;
            if (data.beatPhase < prevBeatPhase) {
                beatTick = true;
                beatIndex++;
                if (beatIndex % 4 === 0) colorOffset++;
            }
            prevBeatPhase = data.beatPhase;

            // Auto director.
            autoDwell += dt;
            if (autoOn && autoDwell >= SCENE_MIN_DWELL) {
                let target = autoScene;
                // Move up if energy clears the next scene's threshold, down if it
                // falls below this one's by more than the hysteresis margin.
                if (autoScene < SCENES.length - 1 && energy >= SCENES[autoScene + 1].enter) {
                    target = autoScene + 1;
                } else if (autoScene > 0 && energy < SCENES[autoScene].enter - SCENE_HYSTERESIS) {
                    target = autoScene - 1;
                }
                if (target !== autoScene) {
                    autoScene = target;
                    autoDwell = 0;
                    applyScene(autoScene);
                }
            }

            const ctx: ModeCtx = { data, dt, beatTick, beatIndex, energy };
            mods = freshMods();
            for (const mode of active.values()) {
                mode.elapsed += dt;
                mode.def.apply(mode, mods, ctx);
            }

            hintTimer = decay(hintTimer, 1, dt);

            rotation += dt * (0.06 + data.intensity * 0.2) * direction;
            modeSpin += mods.spinRate * dt * direction;
            centreDrift += dt * 0.35;

            const targetTwist = 0.5 + smoothBass * 1.4 * (0.4 + data.intensity) + mods.twistAdd;
            twist = approach(twist, targetTwist, 2.4, dt);
            zoomCurrent = approach(zoomCurrent, mods.zoomMul, 9, dt);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;
            const pulse = beatPulse(data.beatPhase, 5);
            const W = canvas.width;
            const H = canvas.height;

            // ---- 1. the burst itself ------------------------------------
            ctx.fillStyle = lerpColor(CREAM, INK, clamp01(mods.bgDark));
            ctx.fillRect(0, 0, W, H);

            const cx = W * (0.5 + Math.cos(centreDrift * 0.6) * 0.13);
            const cy = H * (0.46 + Math.sin(centreDrift * 0.8) * 0.13);
            const maxR = (Math.hypot(W, H) * 1.15) / Math.max(0.18, zoomCurrent);

            const rays = mods.rayOverride ?? RAY_COUNTS[rayCountIndex];
            const step = (Math.PI * 2) / rays;
            const colorShift = colorOffset + mods.colorAdd;
            const paletteAt = (n: number) =>
                PALETTE[(((n % PALETTE.length) + PALETTE.length) % PALETTE.length)];

            ctx.save();
            ctx.translate(cx + mods.shakeX, cy + mods.shakeY);
            ctx.rotate(modeSpin + mods.whip);
            ctx.scale(zoomCurrent, zoomCurrent);
            ctx.translate(-cx, -cy);

            for (let i = 0; i < rays; i++) {
                const a0 = rotation + i * step;
                const width = step * (0.42 + smoothMid * 0.28) * mods.widthMul;
                const a1 = a0 + width;
                const curl = twist * (i % 2 === 0 ? 1 : 0.72) * direction;

                wedgePath(ctx, cx, cy, a0, a1, maxR, curl);
                ctx.fillStyle = paletteAt(i + colorShift);
                ctx.fill();

                // Fan lines are the dominant cost in this theme, so they stay
                // bounded: 9 lines over a band rather than hairlines across the
                // whole frame. Skipped entirely at high ray counts, where they
                // would just be noise.
                if (i % 2 === 0 && rays <= 30 && smoothTreble > 0.02) {
                    const MAX_LINES = 9;
                    const visible = smoothTreble * MAX_LINES;
                    const R_START = 0.12;
                    const R_END = 0.8;
                    const lineSteps = Math.max(3, Math.min(10, Math.ceil(3 + Math.abs(curl) * 4)));

                    ctx.strokeStyle = paletteAt(i + colorShift + 2);
                    ctx.lineWidth = 1.2;

                    for (let l = 1; l <= MAX_LINES; l++) {
                        const alpha = clamp01(visible - (l - 1));
                        if (alpha <= 0.01) break;
                        ctx.globalAlpha = alpha;

                        const lt = l / (MAX_LINES + 1);
                        const la = a1 + width * 0.55 * lt;
                        ctx.beginPath();
                        for (let st = 0; st <= lineSteps; st++) {
                            const t = R_START + (st / lineSteps) * (R_END - R_START);
                            const r = t * maxR;
                            const a = la + curl * CURL_POW[(t * 32) | 0];
                            const x = cx + Math.cos(a) * r;
                            const y = cy + Math.sin(a) * r;
                            if (st === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                    }
                    ctx.globalAlpha = 1;
                }
            }

            const discR = Math.min(W, H) * (0.035 + smoothBass * 0.045 + pulse * 0.018);
            ctx.fillStyle = lerpColor(CREAM, INK, clamp01(mods.bgDark));
            ctx.beginPath();
            ctx.arc(cx, cy, discR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = paletteRgba((((colorShift + 2) % PALETTE.length) + PALETTE.length) % PALETTE.length, 1);
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();

            // ---- 2. feedback echo ----------------------------------------
            // Overlay the previous frame, scaled about the centre. Repeated
            // every frame this compounds into an infinite tunnel.
            if (mods.feedback > 0.01 && echoBuf) {
                const s = mods.feedbackScale;
                ctx.save();
                ctx.globalAlpha = mods.feedback;
                ctx.translate(W / 2, H / 2);
                ctx.scale(s, s);
                ctx.rotate(0.012);
                // Nearest-neighbour sampling for the echo. It's a compounding
                // trail that gets overdrawn every frame, so the interpolation
                // quality is invisible - but bilinear filtering on a full-frame
                // scaled blit is one of the most expensive things you can ask a
                // 2D canvas to do, every frame.
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(echoBuf.source, -W / 2, -H / 2, W, H);
                ctx.imageSmoothingEnabled = true;
                ctx.restore();
                ctx.globalAlpha = 1;
            }

            // ---- 3. kaleidoscope -----------------------------------------
            if (mods.mirror >= 3) {
                workBuf = ensureBuffer(workBuf, W, H);
                if (workBuf) {
                    workBuf.ctx.clearRect(0, 0, W, H);
                    workBuf.ctx.drawImage(canvas, 0, 0);

                    const segs = Math.round(mods.mirror);
                    const half = Math.PI / segs;
                    const R = Math.hypot(W, H);
                    ctx.fillStyle = lerpColor(CREAM, INK, clamp01(mods.bgDark));
                    ctx.fillRect(0, 0, W, H);

                    // Same reasoning as the echo blit: each segment is a rotated
                    // full-frame draw, and bilinear filtering on those dominates
                    // the cost. The seams are hard-clipped anyway.
                    ctx.imageSmoothingEnabled = false;

                    for (let i = 0; i < segs; i++) {
                        ctx.save();
                        ctx.translate(W / 2, H / 2);
                        ctx.rotate((i * Math.PI * 2) / segs);
                        // Alternating segments are mirrored, which is what makes the
                        // seams line up into a mandala instead of a pinwheel.
                        if (i % 2 === 1) ctx.scale(-1, 1);
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.arc(0, 0, R, -half, half);
                        ctx.closePath();
                        ctx.clip();
                        ctx.translate(-W / 2, -H / 2);
                        ctx.drawImage(workBuf.source, 0, 0);
                        ctx.restore();
                    }

                    ctx.imageSmoothingEnabled = true;
                }
            }

            // ---- 4. slice glitch -----------------------------------------
            if (mods.slice > 0.02) {
                const bands = 3 + Math.floor(mods.slice * 6);
                for (let i = 0; i < bands; i++) {
                    const h = 8 + Math.random() * 46;
                    const y = Math.random() * (H - h);
                    const dx = (Math.random() - 0.5) * mods.slice * 190;
                    ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
                }
            }

            // ---- 5. inversion --------------------------------------------
            // 'difference' against white is a true colour negative.
            if (mods.invert > 0.5) {
                ctx.globalCompositeOperation = 'difference';
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                ctx.globalCompositeOperation = 'source-over';
            }

            // ---- 6. flash ------------------------------------------------
            if (mods.flash > 0.01) {
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, mods.flash)})`;
                ctx.fillRect(0, 0, W, H);
            }

            // ---- 7. store this frame for the next echo -------------------
            if (mods.feedback > 0.01) {
                echoBuf = ensureBuffer(echoBuf, W, H);
                if (echoBuf) {
                    echoBuf.ctx.clearRect(0, 0, W, H);
                    echoBuf.ctx.drawImage(canvas, 0, 0);
                }
            } else if (echoBuf) {
                echoBuf = null; // free it when the tunnel is off
            }

            // ---- 8. hud ---------------------------------------------------
            const labels: string[] = [];
            if (autoOn) labels.push(`AUTO ${SCENES[autoScene].name}`);
            for (const m of active.values()) labels.push(m.def.name);

            if (labels.length || hintTimer > 0.01) {
                const onInk = mods.bgDark > 0.5 || mods.invert > 0.5;
                ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.fillStyle = onInk ? 'rgba(255,255,255,0.8)' : 'rgba(20, 16, 12, 0.75)';
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
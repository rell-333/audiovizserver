import { Container, Graphics, Sprite, Texture, ColorMatrixFilter, type Filter } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ZoomBlurFilter, GlitchFilter } from 'pixi-filters';
import { KaleidoFilter } from './kaleidoFilter';
import { createModeEngine, type ModeDef, type Scene } from './modeEngine';
import { beatPulse } from '../beatPulse';
import { approach, clamp01 } from '../smoothing';
import { PALETTE_HEX } from '../palette';
import type { VisualizerData } from '../types';
import type { PixiTheme, PixiThemeContext } from './types';

export const LASER_LABEL = 'Laser';

type Pattern = 'fan' | 'scan' | 'cross' | 'tunnel' | 'split';
const PATTERNS: Pattern[] = ['fan', 'scan', 'cross', 'tunnel', 'split'];

interface Mods {
    fixtures: number; // how many separate heads on the truss
    beams: number;
    spread: number; // angular width of the fan
    sweep: number; // sweep speed
    thickness: number;
    patternIndex: number | null;
    strobeGate: number; // 1 = beams visible, 0 = blacked out
    haze: number;
    bloom: number;
    rgbSplit: number;
    zoomBlur: number;
    glitch: number;
    kaleido: number;
    negative: number;
    colorShift: number;
    flash: number;
    originDrift: number;
    tilt: number;      // vertical aim sweep
    scatter: number;   // mirror-ball style dot scatter
    strobeRate: number;// gated blackout speed multiplier
    beamCurve: number; // bends beams into arcs
}

function freshMods(): Mods {
    return {
        fixtures: 3,
        beams: 16,
        spread: 1.1,
        sweep: 1,
        thickness: 1,
        patternIndex: null,
        strobeGate: 1,
        haze: 0.5,
        bloom: 0.8,
        rgbSplit: 0,
        zoomBlur: 0,
        glitch: 0,
        kaleido: 0,
        negative: 0,
        colorShift: 0,
        flash: 0,
        originDrift: 0,
        tilt: 0,
        scatter: 0,
        strobeRate: 1,
        beamCurve: 0
    };
}

const MODES: ModeDef<Mods>[] = [
    {
        key: '1',
        id: 'blackout',
        name: 'blackout',
        // Beams only exist on the hit. Between beats the rig is dark, which
        // is what makes a laser show feel punchy rather than constant.
        apply(m, mods, c) {
            const GATE = 0.22;
            mods.strobeGate = c.data.beatPhase < GATE ? 1 : 0;
            mods.bloom = Math.max(mods.bloom, 1.1);
            mods.haze = Math.max(mods.haze, 0.8);
        }
    },
    {
        key: '2',
        id: 'sweep',
        name: 'sweep',
        // Fast pattern sweeping, changing shape every 4 beats.
        apply(m, mods, c) {
            if (m.state.p === undefined) m.state.p = 0;
            if (c.beatTick && c.beatIndex % 4 === 0) {
                m.state.p = Math.floor(Math.random() * PATTERNS.length);
            }
            mods.patternIndex = Math.floor(m.state.p);
            mods.sweep = 2.6 + c.energy * 2.4;
            mods.spread = 0.7 + Math.sin(m.elapsed * 0.6) * 0.5;
        }
    },
    {
        key: '3',
        id: 'dense',
        name: 'dense',
        // Far more, far thinner beams: a solid curtain of light.
        apply(m, mods, c) {
            mods.beams = 54;
            mods.thickness = 0.4;
            mods.spread = 1.5;
            mods.bloom = Math.max(mods.bloom, 1);
            void c;
        }
    },
    {
        key: '4',
        id: 'fanout',
        name: 'fanout',
        // The fan opens and closes hard on the beat, like a rig snapping
        // between a tight pencil and a full wash.
        apply(m, mods, c) {
            if (m.state.o === undefined) m.state.o = 0;
            if (c.beatTick) m.state.o = 1;
            m.state.o = Math.max(0, m.state.o - c.dt * 2.2);
            mods.spread = 0.12 + m.state.o * 1.9;
            mods.thickness = 1 + m.state.o * 1.4;
            mods.flash = Math.max(mods.flash, m.state.o * 0.12);
        }
    },
    {
        key: '5',
        id: 'rgbcycle',
        name: 'rgb cycle',
        // Colour steps through the palette on every beat, all beams
        // together, like a colour wheel change.
        apply(m, mods, c) {
            if (m.state.n === undefined) m.state.n = 0;
            if (c.beatTick) m.state.n = (m.state.n || 0) + 1;
            mods.colorShift = Math.floor(m.state.n);
            mods.bloom = Math.max(mods.bloom, 1);
        }
    },
    {
        key: '6',
        id: 'drift',
        name: 'drift',
        // The rig origin wanders, so beams pivot from a moving point.
        apply(m, mods, c) {
            mods.originDrift = clamp01(m.elapsed / 2);
            mods.sweep = 0.8;
            void c;
        }
    },
    {
        key: '7',
        id: 'kaleido',
        name: 'kaleido',
        apply(m, mods, c) {
            if (m.state.i === undefined) m.state.i = 1;
            if (c.beatTick && c.beatIndex % 2 === 0) m.state.i = (m.state.i + 1) % 4;
            mods.kaleido = [4, 6, 8, 12][Math.floor(m.state.i)];
        }
    },
    {
        key: '8',
        id: 'warpspeed',
        name: 'warp speed',
        apply(m, mods, c) {
            if (m.state.s === undefined) m.state.s = 0;
            if (c.beatTick) m.state.s = 1;
            m.state.s = Math.max(0, m.state.s - c.dt * 2);
            mods.zoomBlur = Math.max(mods.zoomBlur, 0.3 + m.state.s * 0.7);
            mods.bloom = Math.max(mods.bloom, 1);
        }
    },
    {
        key: 'f',
        id: 'truss',
        name: 'truss',
        // Spreads the rig across multiple heads along a truss instead of one
        // origin. This is the single biggest upgrade to how "real" it looks -
        // one pivot point reads as a toy, five reads as a stage.
        apply(m, mods, c) {
            const ladder = [3, 5, 7, 9];
            if (m.state.i === undefined) m.state.i = 1;
            if (c.beatTick && c.beatIndex % 8 === 0) m.state.i = (m.state.i + 1) % ladder.length;
            mods.fixtures = ladder[Math.floor(m.state.i)];
            mods.beams = 9;
            mods.spread = 0.85;
        }
    },
    {
        key: 't',
        id: 'tilt',
        name: 'tilt',
        // Heads tilt through the vertical, sweeping the beams up off the
        // floor and back down - moving-head behaviour rather than static.
        apply(m, mods, c) {
            mods.tilt = Math.sin(m.elapsed * 0.8) * (0.7 + c.energy * 0.5);
            mods.sweep = 1.6;
        }
    },
    {
        key: 's',
        id: 'scatter',
        name: 'scatter',
        // Mirror-ball: beams terminate in a field of bright dots that drift,
        // instead of running off-frame.
        apply(m, mods, c) {
            mods.scatter = Math.max(mods.scatter, 0.6 + c.data.trebleNorm * 0.6);
            mods.bloom = Math.max(mods.bloom, 1.1);
        }
    },
    {
        key: 'b',
        id: 'bend',
        name: 'bend',
        // Curves the beams into arcs, which reads as haze refraction and
        // makes the rig feel less rigid.
        apply(m, mods, c) {
            mods.beamCurve = Math.sin(m.elapsed * 0.5) * (0.5 + c.data.bassNorm * 0.6);
            mods.thickness = 1.2;
        }
    },
    {
        key: 'c',
        id: 'chroma',
        name: 'chroma',
        apply(m, mods, c) {
            mods.rgbSplit = Math.max(mods.rgbSplit, 0.3 + beatPulse(c.data.beatPhase, 3) * 0.6);
        }
    },
    {
        key: 'x',
        id: 'glitch',
        name: 'glitch',
        apply(m, mods, c) {
            if (m.state.h === undefined) m.state.h = 0;
            if (c.beatTick) m.state.h = 1;
            m.state.h = Math.max(0, m.state.h - c.dt * 4);
            mods.glitch = Math.max(mods.glitch, m.state.h * 0.8);
        }
    },
    {
        key: 'n',
        id: 'negative',
        name: 'negative',
        apply(m, mods, c) {
            if (m.state.b === undefined) m.state.b = 0;
            if (c.beatTick) m.state.b = 1;
            m.state.b = Math.max(0, m.state.b - c.dt * 8);
            mods.negative = m.state.b > 0.35 ? 1 : 0;
        }
    }
];

const SCENES: Scene[] = [
    { name: 'standby', enter: 0.0, modes: ['drift', 'bend'] },
    { name: 'warmup', enter: 0.32, modes: ['sweep', 'truss'] },
    { name: 'building', enter: 0.54, modes: ['sweep', 'truss', 'tilt', 'rgbcycle'] },
    { name: 'full rig', enter: 0.72, modes: ['blackout', 'truss', 'dense', 'sweep', 'scatter', 'rgbcycle'] },
    { name: 'overdrive', enter: 0.87, modes: ['blackout', 'truss', 'dense', 'sweep', 'warpspeed', 'scatter', 'kaleido', 'chroma'] }
];

// "Laser": a beam rig. Thin additive lines from a moving origin, drawn
// over a haze glow so the beams look volumetric, then pushed through
// heavy bloom. This is the theme that most depends on the GPU - the same
// look in Canvas 2D would need a real blur per frame.
export function createLaserTheme(): PixiTheme {
    const engine = createModeEngine<Mods>({ modes: MODES, scenes: SCENES, freshMods, autoStartOn: true });

    let root: Container | null = null;
    let bg: Graphics | null = null;
    let haze: Sprite | null = null;
    let beams: Graphics | null = null;

    let bloomF: AdvancedBloomFilter | null = null;
    let rgbF: RGBSplitFilter | null = null;
    let zoomF: ZoomBlurFilter | null = null;
    let glitchF: GlitchFilter | null = null;
    let kaleidoF: KaleidoFilter | null = null;
    let colorF: ColorMatrixFilter | null = null;

    let W = 0;
    let H = 0;
    let clock = 0;
    let sweepPhase = 0;
    let smoothSpread = 1.1;
    let onStatus: ((labels: string[], hint: string) => void) | null = null;

    // Where each beam points, per pattern. Returns an angle in radians.
    function beamAngle(pattern: Pattern, i: number, count: number, phase: number): number {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        switch (pattern) {
            case 'fan':
                return -Math.PI / 2 + (t - 0.5) * smoothSpread * 2 + Math.sin(phase) * 0.35;
            case 'scan':
                // All beams parallel, sweeping together across the room.
                return -Math.PI / 2 + Math.sin(phase + t * 0.12) * 1.25;
            case 'cross':
                // Two opposed fans crossing in the middle.
                return (i % 2 === 0 ? -1 : 1) * (0.4 + t * smoothSpread) + Math.sin(phase) * 0.25;
            case 'tunnel':
                // Full circle, rotating - beams radiate outward.
                return t * Math.PI * 2 + phase * 0.6;
            case 'split':
                // Two tight bunches pulling apart and back together.
                return (t < 0.5 ? -1 : 1) * (0.5 + Math.abs(Math.sin(phase)) * smoothSpread) +
                    (t - 0.5) * 0.4;
        }
    }

    return {
        label: LASER_LABEL,
        keyHelp: engine.keyHelp(),

        setup(ctx: PixiThemeContext) {
            root = ctx.root;
            W = ctx.width;
            H = ctx.height;

            bg = new Graphics();
            beams = new Graphics();
            // Additive blending is what makes overlapping beams brighten into
            // white hot spots instead of just stacking opaquely.
            beams.blendMode = 'add';

            haze = new Sprite(Texture.WHITE);
            haze.blendMode = 'add';
            haze.alpha = 0;

            root.addChild(bg, haze, beams);

            kaleidoF = new KaleidoFilter({ segments: 6, centre: { x: W / 2, y: H / 2 }, mix: 1 });
            zoomF = new ZoomBlurFilter({ strength: 0, center: { x: W / 2, y: H * 0.9 }, innerRadius: 40 });
            glitchF = new GlitchFilter({ slices: 8, offset: 0 });
            rgbF = new RGBSplitFilter();
            bloomF = new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 1, blur: 9, quality: 5 });
            colorF = new ColorMatrixFilter();

            const chain = [kaleidoF, zoomF, glitchF, rgbF, bloomF, colorF] as unknown as Filter[];
            for (const f of chain) f.enabled = false;
            // Bloom is on by default here: without it, beams are just thin
            // lines. The glow *is* the effect.
            bloomF.enabled = true;
            root.filters = chain;
        },

        destroy() {
            bg?.destroy();
            beams?.destroy();
            haze?.destroy();
            if (root) root.filters = [];
            bg = beams = null;
            haze = null;
            engine.reset();
        },

        onKey(key: string) {
            engine.onKey(key);
        },

        update(data: VisualizerData, dt: number, ctx: PixiThemeContext) {
            if (!bg || !beams || !haze) return;

            if (ctx.width !== W || ctx.height !== H) {
                W = ctx.width;
                H = ctx.height;
                kaleidoF?.setCentre(W / 2, H / 2);
                zoomF?.center && (zoomF.center = { x: W / 2, y: H * 0.9 } as never);
            }

            const { mods } = engine.frame(data, dt);
            clock += dt;
            sweepPhase += dt * mods.sweep;
            smoothSpread = approach(smoothSpread, mods.spread, 6, dt);

            const pulse = beatPulse(data.beatPhase, 4);

            bg.clear();
            bg.rect(0, 0, W, H).fill({ color: 0x04030a });

            // Origin sits low, like a rig at the back of a stage.
            const ox = W / 2 + (mods.originDrift ? Math.sin(clock * 0.5) * W * 0.3 : 0);
            const oy = H * 0.92;

            // Haze: a broad additive wash centred on the rig, so beams appear
            // to be cutting through smoke.
            haze.width = W * 2;
            haze.height = H * 2;
            haze.anchor.set(0.5);
            haze.position.set(ox, oy);
            haze.tint = PALETTE_HEX[(Math.floor(mods.colorShift) + 3) % PALETTE_HEX.length];
            haze.alpha = mods.haze * 0.06 * (0.6 + data.bassNorm * 0.8) * mods.strobeGate;

            beams.clear();

            const beamsPerFixture = Math.max(2, Math.round(mods.beams));
            const fixtureCount = Math.max(1, Math.round(mods.fixtures));
            const pattern = PATTERNS[(mods.patternIndex ?? 0) % PATTERNS.length];
            const len = Math.hypot(W, H) * 1.3;
            const spectrum = data.spectrumNorm;

            // Gate can run faster than one beat when strobeRate is raised.
            const gateOpen = mods.strobeGate > 0.5;

            if (gateOpen) {
                for (let f = 0; f < fixtureCount; f++) {
                    // Fixtures sit spread along a truss rather than all at one
                    // point. A single origin is what made this look flat.
                    const ft = fixtureCount === 1 ? 0.5 : f / (fixtureCount - 1);
                    const fx = ox + (ft - 0.5) * W * 0.82;
                    const fy = oy - Math.abs(ft - 0.5) * H * 0.06;
                    // Alternate heads counter-sweep, so the rig crosses itself.
                    const dir = f % 2 === 0 ? 1 : -1;
                    const phase = sweepPhase * dir + f * 0.7;

                    for (let i = 0; i < beamsPerFixture; i++) {
                        const a = beamAngle(pattern, i, beamsPerFixture, phase) + mods.tilt * 0.5;

                        const binIndex = Math.floor(((f * beamsPerFixture + i) / (fixtureCount * beamsPerFixture)) * spectrum.length);
                        const bin = spectrum.length ? spectrum[binIndex] || 0 : 0.5;
                        const bright = 0.25 + bin * 0.75;

                        const color = PALETTE_HEX[(f + i + Math.floor(mods.colorShift)) % PALETTE_HEX.length];
                        const w = (1.2 + bin * 4) * mods.thickness * (1 + pulse * 0.4);

                        // Beams are drawn as short segment chains so they can curve;
                        // a straight line can't bend and curved beams read as haze
                        // refraction rather than laser pointers.
                        const SEGS = mods.beamCurve !== 0 ? 7 : 1;
                        const pts: Array<[number, number]> = [[fx, fy]];
                        for (let sIdx = 1; sIdx <= SEGS; sIdx++) {
                            const tt = sIdx / SEGS;
                            const bend = mods.beamCurve * tt * tt * 0.6;
                            const aa = a + bend;
                            pts.push([fx + Math.cos(aa) * len * tt, fy + Math.sin(aa) * len * tt]);
                        }

                        // Wide faint haze pass first, continuous, this is what
                        // makes the beam read as light in smoke rather than a wire.
                        beams.moveTo(pts[0][0], pts[0][1]);
                        for (let k = 1; k < pts.length; k++) beams.lineTo(pts[k][0], pts[k][1]);
                        beams.stroke({ width: w * 3.2, color, alpha: bright * 0.14 });

                        // The bright core is chopped into dashes rather than one
                        // solid stroke, like a gobo/chopper wheel cutting the beam.
                        // A flat continuous line was the single biggest reason this
                        // looked plain: real rig beams almost never read as an
                        // unbroken wire, they pulse and chop along their length.
                        const DASH_COUNT = 9;
                        const dashPhase = clock * (2.4 + bin * 3) + i * 0.6 + f * 1.1;
                        for (let d = 0; d < DASH_COUNT; d++) {
                            const t0 = d / DASH_COUNT;
                            const t1 = (d + 0.55) / DASH_COUNT;
                            const onOff = Math.sin(dashPhase + d * 1.7);
                            if (onOff < -0.15) continue; // gap
                            const dashAlpha = bright * 0.85 * (0.5 + Math.max(0, onOff) * 0.5);

                            const segFrom: [number, number] = [
                                fx + (pts[pts.length - 1][0] - fx) * t0,
                                fy + (pts[pts.length - 1][1] - fy) * t0
                            ];
                            const segTo: [number, number] = [
                                fx + (pts[pts.length - 1][0] - fx) * t1,
                                fy + (pts[pts.length - 1][1] - fy) * t1
                            ];
                            // Follow the curve if this beam bends, rather than
                            // cutting a straight chord across it.
                            if (mods.beamCurve !== 0) {
                                const bendFrom = mods.beamCurve * t0 * t0 * 0.6;
                                const bendTo = mods.beamCurve * t1 * t1 * 0.6;
                                segFrom[0] = fx + Math.cos(a + bendFrom) * len * t0;
                                segFrom[1] = fy + Math.sin(a + bendFrom) * len * t0;
                                segTo[0] = fx + Math.cos(a + bendTo) * len * t1;
                                segTo[1] = fy + Math.sin(a + bendTo) * len * t1;
                            }
                            beams.moveTo(segFrom[0], segFrom[1]);
                            beams.lineTo(segTo[0], segTo[1]);
                            beams.stroke({ width: w, color, alpha: dashAlpha });
                        }

                        // Mirror-ball scatter: bright dots along the beam path.
                        if (mods.scatter > 0.01) {
                            const dots = 5;
                            for (let d = 1; d <= dots; d++) {
                                const tt = d / (dots + 1);
                                const bend = mods.beamCurve * tt * tt * 0.6;
                                const aa = a + bend;
                                const dx = fx + Math.cos(aa) * len * tt;
                                const dy = fy + Math.sin(aa) * len * tt;
                                const jitter = Math.sin(clock * 3 + d * 2 + i) * 8;
                                beams
                                    .circle(dx + jitter, dy + jitter * 0.5, (1.5 + bin * 4) * mods.scatter)
                                    .fill({ color, alpha: bright * 0.8 * mods.scatter });
                            }
                        }
                    }

                    // Source flare at each head.
                    beams
                        .circle(fx, fy, 4 + data.bassNorm * 16 + pulse * 8)
                        .fill({ color: 0xffffff, alpha: 0.5 });
                }
            }

            // --- mirror-ball centerpiece --------------------------------------
            // Drawn unconditionally, not behind a mode key: this is set
            // dressing that gives the rig a physical anchor point instead of
            // beams appearing to radiate from nowhere. A rotating ring of
            // faceted diamonds, each catching light differently, is what
            // reads as "disco ball" rather than a plain circle.
            {
                const ballR = Math.min(W, H) * (0.035 + data.bassNorm * 0.012 + pulse * 0.006);
                const facetCount = 14;
                const ballRotation = clock * 0.9;

                for (let fi = 0; fi < facetCount; fi++) {
                    const a = ballRotation + (fi / facetCount) * Math.PI * 2;
                    // Facets on the far side of the rotation are dimmer, cheap
                    // fake lighting that's enough to sell "faceted sphere".
                    const facing = Math.cos(a - ballRotation * 0 + fi * 0.001);
                    const litness = 0.4 + 0.6 * Math.max(0, Math.sin(a * 2 + ballRotation * 1.7));
                    const fr = ballR * (0.75 + 0.25 * Math.sin(a * 3));
                    const fx2 = ox + Math.cos(a) * fr;
                    const fy2 = oy + Math.sin(a) * fr * 0.55;
                    const facetColor = litness > 0.75 ? 0xffffff : PALETTE_HEX[fi % PALETTE_HEX.length];
                    beams
                        .circle(fx2, fy2, ballR * 0.16 * (0.6 + litness * 0.5))
                        .fill({ color: facetColor, alpha: 0.5 + litness * 0.5 });
                    void facing;
                }

                // Core sphere body, dark so the facets read as reflections on
                // its surface rather than floating dots.
                beams.circle(ox, oy, ballR * 0.6).fill({ color: 0x18141f, alpha: 0.85 });
                beams
                    .circle(ox, oy, ballR * 0.6)
                    .stroke({ width: 1.5, color: PALETTE_HEX[Math.floor(mods.colorShift) % PALETTE_HEX.length], alpha: 0.6 });
            }

            if (mods.flash > 0.01) {
                beams.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: Math.min(1, mods.flash) });
            }

            if (bloomF) {
                bloomF.enabled = mods.bloom > 0.01;
                bloomF.bloomScale = mods.bloom * 0.85;
            }
            if (rgbF) {
                rgbF.enabled = mods.rgbSplit > 0.01;
                const s = mods.rgbSplit * 10;
                rgbF.red = { x: -s, y: 0 } as never;
                rgbF.green = { x: 0, y: s * 0.5 } as never;
                rgbF.blue = { x: s, y: 0 } as never;
            }
            if (zoomF) {
                zoomF.enabled = mods.zoomBlur > 0.01;
                zoomF.strength = mods.zoomBlur * 0.5;
            }
            if (glitchF) {
                glitchF.enabled = mods.glitch > 0.02;
                glitchF.offset = mods.glitch * 60;
            }
            if (kaleidoF) {
                kaleidoF.enabled = mods.kaleido >= 3;
                if (kaleidoF.enabled) {
                    kaleidoF.segments = mods.kaleido;
                    kaleidoF.mix = 1;
                    kaleidoF.rotation = clock * 0.15;
                    kaleidoF.setCentre(W / 2, H * 0.55);
                }
            }
            if (colorF) {
                colorF.enabled = mods.negative > 0.5;
                if (colorF.enabled) {
                    colorF.reset();
                    colorF.negative(true);
                }
            }

            if (onStatus) {
                const s = engine.status();
                onStatus(s.labels, s.hint);
            }
        },

        setStatusHandler(fn: (labels: string[], hint: string) => void) {
            onStatus = fn;
        }
    } as PixiTheme & { setStatusHandler(fn: (labels: string[], hint: string) => void): void };
}
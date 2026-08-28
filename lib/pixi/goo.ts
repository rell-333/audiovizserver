import { Container, Graphics, ColorMatrixFilter, BlurFilter, type Filter } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, BulgePinchFilter } from 'pixi-filters';
import { KaleidoFilter } from './kaleidoFilter';
import { GooFilter } from './gooFilter';
import { createModeEngine, type ModeDef, type Scene } from './modeEngine';
import { beatPulse } from '../beatPulse';
import { clamp01 } from '../smoothing';
import { PALETTE_HEX } from '../palette';
import type { VisualizerData } from '../types';
import type { PixiTheme, PixiThemeContext } from './types';

export const GOO_LABEL = 'Goo';

// ---------------------------------------------------------------------
// Metaballs via a blur + hard alpha-threshold pass (see gooFilter.ts).
// Overlapping blurred circles sum past the cutoff and fuse with a smooth
// shared neck; isolated ones stay round. This was pulled out for one
// round after a GPU crash elsewhere made me cautious about every custom
// shader in the project, even ones with no evidence against them. It's
// back after the actual crash cause turned out to be unrelated (a React
// lifecycle bug destroying and recreating the WebGL context on every
// theme switch, see app/page.tsx), and after compiling and executing
// this exact two-pass shader pipeline against a real GPU driver via
// ANGLE to confirm it links and runs clean.

interface Blob {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    color: number;
    band: 0 | 1 | 2;
    wobble: number;
    wobbleSpeed: number;
}

interface Mods {
    blur: number;
    threshold: number;
    softness: number;
    rim: number;
    highlight: number;
    speed: number;
    sizeMul: number;
    spread: number;
    gather: number;
    bloom: number;
    rgbSplit: number;
    bulge: number;
    negative: number;
    kaleido: number;
    bgDark: number;
    flash: number;
    swirl: number;   // orbital rotation of the whole mass
    gravity: number; // pulls blobs to the floor and they pile up
    jet: number;     // blobs launched upward on the beat
    splitPulse: number; // blobs divide into more, smaller ones
    trail: number;   // motion trails
}

function freshMods(): Mods {
    return {
        blur: 18,
        threshold: 0.5,
        softness: 0.045,
        rim: 0.5,
        highlight: 0.7,
        speed: 1,
        sizeMul: 1,
        spread: 0,
        gather: 0,
        bloom: 0.3,
        rgbSplit: 0,
        bulge: 0,
        negative: 0,
        kaleido: 0,
        bgDark: 0,
        flash: 0,
        swirl: 0,
        gravity: 0,
        jet: 0,
        splitPulse: 0,
        trail: 0
    };
}

const MODES: ModeDef<Mods>[] = [
    {
        key: '1',
        id: 'fuse',
        name: 'fuse',
        apply(m, mods, c) {
            const cycle = 0.5 + 0.5 * Math.sin(m.elapsed * 0.55);
            mods.gather = Math.max(mods.gather, cycle * (0.6 + c.energy * 0.5));
            mods.blur = 28;
            mods.threshold = 0.42;
            mods.softness = 0.06;
        }
    },
    {
        key: '2',
        id: 'burst',
        name: 'burst',
        apply(m, mods, c) {
            if (m.state.p === undefined) m.state.p = 0;
            if (c.beatTick) m.state.p = 1;
            m.state.p = Math.max(0, m.state.p - c.dt * 1.8);
            mods.spread = Math.max(mods.spread, m.state.p);
            mods.sizeMul *= 1 + m.state.p * 0.25;
            mods.flash = Math.max(mods.flash, m.state.p * 0.12);
        }
    },
    {
        key: '3',
        id: 'melt',
        name: 'melt',
        apply(m, mods) {
            const d = clamp01(m.elapsed / 2);
            mods.blur = 18 + d * 24;
            mods.speed = 0.45;
            mods.threshold = 0.46;
            mods.sizeMul *= 1 + d * 0.35;
        }
    },
    {
        key: '4',
        id: 'chrome',
        name: 'chrome',
        apply(m, mods, c) {
            mods.rim = 1;
            mods.highlight = 1.6;
            mods.softness = 0.018;
            mods.blur = 10;
            mods.bloom = Math.max(mods.bloom, 0.55 + beatPulse(c.data.beatPhase, 3) * 0.4);
            mods.bgDark = Math.max(mods.bgDark, 1);
        }
    },
    {
        key: '5',
        id: 'boil',
        name: 'boil',
        apply(m, mods, c) {
            mods.speed = 2.6 + c.data.trebleNorm * 2;
            mods.blur = 12;
            mods.threshold = 0.58;
            mods.softness = 0.02;
            mods.sizeMul *= 0.82;
        }
    },
    {
        key: '6',
        id: 'lens',
        name: 'lens',
        apply(m, mods, c) {
            mods.bulge = Math.max(
                mods.bulge,
                clamp01(m.elapsed / 1.5) * (0.4 * Math.sin(m.elapsed * 0.5) + c.data.bassNorm * 0.35)
            );
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
        id: 'negative',
        name: 'negative',
        apply(m, mods, c) {
            if (m.state.b === undefined) m.state.b = 0;
            if (c.beatTick) m.state.b = 1;
            m.state.b = Math.max(0, m.state.b - c.dt * 8);
            const on = m.state.b > 0.35 ? 1 : 0;
            mods.negative = Math.max(mods.negative, on);
            mods.bgDark = Math.max(mods.bgDark, on);
        }
    },
    {
        key: '9',
        id: 'swirl',
        name: 'swirl',
        // The whole mass orbits its centre, so blobs stretch into rotating
        // arms instead of drifting aimlessly. Gives the theme actual motion
        // design rather than a screensaver wander.
        apply(m, mods, c) {
            mods.swirl = Math.max(mods.swirl, clamp01(m.elapsed / 2) * (1 + c.energy));
            mods.blur = 24;
            mods.threshold = 0.46;
        }
    },
    {
        key: 'j',
        id: 'jet',
        name: 'jet',
        // Every beat fires blobs upward like a lava fountain, then gravity
        // drags them back. The most eventful thing in here.
        apply(m, mods, c) {
            if (m.state.k === undefined) m.state.k = 0;
            if (c.beatTick) m.state.k = 1;
            m.state.k = Math.max(0, m.state.k - c.dt * 2.6);
            mods.jet = Math.max(mods.jet, m.state.k);
            mods.gravity = Math.max(mods.gravity, 0.8);
            mods.flash = Math.max(mods.flash, m.state.k * 0.1);
        }
    },
    {
        key: 'v',
        id: 'gravity',
        name: 'gravity',
        // Everything falls and pools at the bottom, merging into one heavy
        // mass that sloshes with the bass.
        apply(m, mods, c) {
            mods.gravity = Math.max(mods.gravity, 1);
            mods.blur = 30;
            mods.threshold = 0.4;
            void c;
        }
    },
    {
        key: 'x',
        id: 'trail',
        name: 'trail',
        // Motion trails, so fast blobs leave comet tails through the goo.
        apply(m, mods, c) {
            mods.trail = Math.max(mods.trail, 0.72 + c.energy * 0.2);
            mods.bloom = Math.max(mods.bloom, 0.5);
        }
    },
    {
        key: 'g',
        id: 'glow',
        name: 'glow',
        apply(m, mods, c) {
            mods.bloom = Math.max(mods.bloom, 0.7 + beatPulse(c.data.beatPhase, 3) * 0.7);
        }
    },
    {
        key: 'c',
        id: 'chroma',
        name: 'chroma',
        apply(m, mods, c) {
            mods.rgbSplit = Math.max(mods.rgbSplit, 0.3 + beatPulse(c.data.beatPhase, 3) * 0.6);
        }
    }
];

const SCENES: Scene[] = [
    { name: 'still', enter: 0.0, modes: ['melt', 'swirl'] },
    { name: 'drift', enter: 0.32, modes: ['fuse', 'swirl', 'glow'] },
    { name: 'simmer', enter: 0.54, modes: ['boil', 'swirl', 'trail', 'glow'] },
    { name: 'rolling', enter: 0.72, modes: ['boil', 'jet', 'chrome', 'trail'] },
    { name: 'eruption', enter: 0.87, modes: ['jet', 'burst', 'chrome', 'kaleido', 'negative', 'glow'] }
];

export function createGooTheme(): PixiTheme {
    const engine = createModeEngine<Mods>({ modes: MODES, scenes: SCENES, freshMods, autoStartOn: true });

    let root: Container | null = null;
    let bg: Graphics | null = null;
    let blobLayer: Container | null = null;
    let blobGfx: Graphics | null = null;

    let blurF: BlurFilter | null = null;
    let gooF: GooFilter | null = null;
    let bloomF: AdvancedBloomFilter | null = null;
    let rgbF: RGBSplitFilter | null = null;
    let bulgeF: BulgePinchFilter | null = null;
    let kaleidoF: KaleidoFilter | null = null;
    let colorF: ColorMatrixFilter | null = null;

    let blobs: Blob[] = [];
    let W = 0;
    let H = 0;
    let clock = 0;
    let onStatus: ((labels: string[], hint: string) => void) | null = null;

    function seed() {
        blobs = [];
        const base = Math.min(W, H);
        for (let i = 0; i < 11; i++) {
            blobs.push({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: (Math.random() - 0.5) * 70,
                vy: (Math.random() - 0.5) * 70,
                r: base * (0.055 + Math.random() * 0.075),
                color: PALETTE_HEX[i % PALETTE_HEX.length],
                band: (i % 3) as 0 | 1 | 2,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.7 + Math.random() * 1.8
            });
        }
    }

    return {
        label: GOO_LABEL,
        keyHelp: engine.keyHelp(),

        setup(ctx: PixiThemeContext) {
            root = ctx.root;
            W = ctx.width;
            H = ctx.height;

            bg = new Graphics();
            blobGfx = new Graphics();

            blobLayer = new Container();
            blobLayer.addChild(blobGfx);
            // Only vetted, bundled filters here: BlurFilter fuses overlapping
            // blobs visually, ColorMatrixFilter's contrast push keeps the
            // fused areas reading as solid rather than just hazy.
            blurF = new BlurFilter({ strength: 18, quality: 4 });
            gooF = new GooFilter({ threshold: 0.5, softness: 0.045, rim: 0.5, highlight: 0.7 });
            blobLayer.filters = [blurF, gooF as unknown as Filter];

            root.addChild(bg, blobLayer);

            kaleidoF = new KaleidoFilter({ segments: 6, centre: { x: W / 2, y: H / 2 }, mix: 1 });
            bulgeF = new BulgePinchFilter({ center: { x: 0.5, y: 0.5 }, radius: Math.min(W, H) * 0.75, strength: 0 });
            rgbF = new RGBSplitFilter();
            bloomF = new AdvancedBloomFilter({ threshold: 0.65, bloomScale: 0, blur: 7, quality: 4 });
            colorF = new ColorMatrixFilter();
            const chain = [bulgeF, kaleidoF, rgbF, bloomF, colorF] as unknown as Filter[];
            for (const f of chain) f.enabled = false;
            root.filters = chain;

            seed();
        },

        destroy() {
            bg?.destroy();
            blobGfx?.destroy();
            if (blobLayer) blobLayer.filters = [];
            blobLayer?.destroy();
            if (root) root.filters = [];
            bg = blobGfx = null;
            blobLayer = null;
            blobs = [];
            engine.reset();
        },

        onKey(key: string) {
            engine.onKey(key);
        },

        update(data: VisualizerData, dt: number, ctx: PixiThemeContext) {
            if (!bg || !blobGfx) return;

            if (ctx.width !== W || ctx.height !== H) {
                W = ctx.width;
                H = ctx.height;
                kaleidoF?.setCentre(W / 2, H / 2);
                seed();
            }

            const { mods } = engine.frame(data, dt);
            clock += dt;

            const bands = [data.bassNorm, data.midNorm, data.trebleNorm];
            const cx = W / 2;
            const cy = H / 2;
            const pulse = beatPulse(data.beatPhase, 4);

            bg.clear();
            bg.rect(0, 0, W, H).fill({ color: mods.bgDark > 0.5 ? 0x07050e : 0x140c22 });

            // Trails are done by fading the background instead of clearing it,
            // so previous blob positions bleed through.
            if (mods.trail > 0.01) {
                bg.alpha = 1 - mods.trail * 0.75;
            } else {
                bg.alpha = 1;
            }

            blobGfx.clear();

            for (const b of blobs) {
                b.wobble += b.wobbleSpeed * dt;

                if (mods.gather > 0.01) {
                    b.vx += (cx - b.x) * mods.gather * dt * 2.2;
                    b.vy += (cy - b.y) * mods.gather * dt * 2.2;
                }
                if (mods.spread > 0.01) {
                    const dx = b.x - cx;
                    const dy = b.y - cy;
                    const d = Math.max(1, Math.hypot(dx, dy));
                    b.vx += (dx / d) * mods.spread * 900 * dt;
                    b.vy += (dy / d) * mods.spread * 900 * dt;
                }

                // Swirl: tangential force around the centre, so the mass rotates
                // as a body and blobs stretch into arms.
                if (mods.swirl > 0.01) {
                    const dx = b.x - cx;
                    const dy = b.y - cy;
                    const d = Math.max(1, Math.hypot(dx, dy));
                    b.vx += (-dy / d) * mods.swirl * 340 * dt;
                    b.vy += (dx / d) * mods.swirl * 340 * dt;
                }

                // Gravity pulls down; the floor is soft so they pool and squash
                // rather than bouncing like billiard balls.
                if (mods.gravity > 0.01) {
                    b.vy += mods.gravity * 900 * dt;
                }

                // Jet: fires blobs upward from the floor on the beat.
                if (mods.jet > 0.01 && b.y > H * 0.6) {
                    b.vy -= mods.jet * 1500 * dt * (0.6 + Math.random() * 0.8);
                    b.vx += (Math.random() - 0.5) * mods.jet * 400 * dt;
                }

                b.vx *= 0.985;
                b.vy *= 0.985;
                b.x += b.vx * dt * mods.speed;
                b.y += b.vy * dt * mods.speed;

                const band = bands[b.band] || 0;
                const r = b.r * mods.sizeMul * (0.7 + band * 0.6 + pulse * 0.12) * (1 + Math.sin(b.wobble) * 0.08);

                if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); }
                if (b.x > W - r) { b.x = W - r; b.vx = -Math.abs(b.vx); }
                if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy); }
                if (b.y > H - r) { b.y = H - r; b.vy = -Math.abs(b.vy); }

                blobGfx.circle(b.x, b.y, r).fill({ color: b.color });
            }

            if (blurF) blurF.strength = mods.blur;
            if (gooF) {
                gooF.threshold = mods.threshold;
                gooF.softness = mods.softness;
                gooF.rim = mods.rim;
                gooF.highlight = mods.highlight;
            }
            if (bloomF) {
                bloomF.enabled = mods.bloom > 0.01;
                bloomF.bloomScale = mods.bloom * 0.6;
            }
            if (rgbF) {
                rgbF.enabled = mods.rgbSplit > 0.01;
                const s = mods.rgbSplit * 10;
                rgbF.red = { x: -s, y: 0 } as never;
                rgbF.green = { x: 0, y: s * 0.5 } as never;
                rgbF.blue = { x: s, y: 0 } as never;
            }
            if (bulgeF) {
                bulgeF.enabled = Math.abs(mods.bulge) > 0.01;
                bulgeF.strength = mods.bulge;
            }
            if (kaleidoF) {
                kaleidoF.enabled = mods.kaleido >= 3;
                if (kaleidoF.enabled) {
                    kaleidoF.segments = mods.kaleido;
                    kaleidoF.mix = 1;
                    kaleidoF.rotation = clock * 0.2;
                    kaleidoF.setCentre(cx, cy);
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
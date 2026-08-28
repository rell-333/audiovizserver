import { Container, Graphics, Sprite, RenderTexture, ColorMatrixFilter, type Filter } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, PixelateFilter, GlitchFilter } from 'pixi-filters';
import { DatamoshFilter } from './datamoshFilter';
import { createModeEngine, type ModeDef, type Scene } from './modeEngine';
import { beatPulse } from '../beatPulse';
import { clamp01 } from '../smoothing';
import { PALETTE_HEX } from '../palette';
import type { VisualizerData } from '../types';
import type { PixiTheme, PixiThemeContext } from './types';

export const DATAMOSH_LABEL = 'Datamosh';

// ---------------------------------------------------------------------
// A previous version of this theme used a hand-written fragment shader
// that displaced the prior frame per-macroblock using motion vectors,
// simulating real codec datamoshing. That shader had a bug: it declared
// a second sampler (uPrev) but never registered it as a bound resource,
// only assigned it after construction. Sampling an unbound texture unit
// is undefined GPU behaviour, and on at least one machine it triggered a
// driver-level crash (a Windows TDR reset) severe enough to take down
// other GPU-using applications, not just the browser tab.
//
// This version achieves the same "decoder starved of I-frames" look
// using only vetted, pre-built filters and the exact RenderTexture
// ping-pong pattern already used safely elsewhere (see Sunburst's
// tunnel mode): the previous frame is a plain Sprite composited under
// the new render at low alpha, and GlitchFilter's built-in block-slice
// displacement stands in for per-macroblock motion. No custom shader
// code runs anywhere in this theme.
// ---------------------------------------------------------------------

interface Mods {
    iframe: number; // 1 = clean picture, 0 = pure melt
    retain: number; // how much of the previous frame persists
    blockSize: number; // macroblock size for motion displacement
    drift: number; // how far blocks are pushed each frame
    churn: number; // how fast the motion field rewrites itself
    bias: number; // overall smear direction
    moshBleed: number; // chroma bleed distance in the shader
    glitchSlices: number;
    glitchOffset: number;
    pixelate: number;
    bleed: number;
    bloom: number;
    rgbSplit: number;
    negative: number;
    sceneSpeed: number;
    flash: number;
}

function freshMods(): Mods {
    return {
        iframe: 1,
        retain: 0,
        blockSize: 24,
        drift: 0,
        churn: 0.7,
        bias: 0,
        moshBleed: 0,
        glitchSlices: 6,
        glitchOffset: 0,
        pixelate: 0,
        bleed: 0,
        bloom: 0,
        rgbSplit: 0,
        negative: 0,
        sceneSpeed: 1,
        flash: 0
    };
}

const MODES: ModeDef<Mods>[] = [
    {
        key: '1',
        id: 'melt',
        name: 'melt',
        // The headline effect: starve the decoder of I-frames so the motion
        // vectors keep dragging the picture around instead of it ever being
        // redrawn. Drift climbs the longer it runs.
        apply(m, mods, c) {
            const depth = clamp01(m.elapsed / 3);
            mods.iframe = Math.min(mods.iframe, 0.13 - depth * 0.09);
            mods.drift = Math.max(mods.drift, 8 + depth * 12 + c.data.bassNorm * 10);
            mods.churn = 0.7;
            mods.retain = 1;
            mods.moshBleed = Math.max(mods.moshBleed, 3);
        }
    },
    {
        key: '2',
        id: 'blocks',
        name: 'blocks',
        // Macroblock size steps on the beat. Big blocks read as a low
        // bitrate stream falling apart; small ones as fine grain.
        apply(m, mods, c) {
            if (m.state.i === undefined) m.state.i = 2;
            if (c.beatTick) {
                const LADDER = [8, 16, 32, 64, 110];
                m.state.i = (m.state.i + 1) % LADDER.length;
                m.state.size = LADDER[m.state.i];
            }
            mods.blockSize = m.state.size || 32;
            mods.drift = Math.max(mods.drift, 10);
            mods.iframe = Math.min(mods.iframe, 0.3);
            mods.retain = 1;
        }
    },
    {
        key: '3',
        id: 'bleed',
        name: 'bleed',
        // Colour smears further than luma, pulsing with the beat.
        apply(m, mods, c) {
            const pulse = beatPulse(c.data.beatPhase, 3);
            mods.moshBleed = Math.max(mods.moshBleed, 4 + pulse * 20 + c.data.bassNorm * 10);
            mods.rgbSplit = Math.max(mods.rgbSplit, 0.25 + pulse * 0.3);
            mods.iframe = Math.min(mods.iframe, 0.45);
            mods.drift = Math.max(mods.drift, 5);
            mods.retain = 1;
        }
    },
    {
        key: '4',
        id: 'slam',
        name: 'slam',
        // Rhythmic I-frames: the picture snaps back clean on the beat then
        // immediately starts melting again. Makes the corruption musical.
        apply(m, mods, c) {
            if (m.state.snap === undefined) m.state.snap = 0;
            if (c.beatTick) m.state.snap = 1;
            m.state.snap = Math.max(0, m.state.snap - c.dt * 3.4);
            const snap = m.state.snap;
            mods.iframe = Math.min(1, Math.max(snap * snap, 0.05));
            mods.drift = Math.max(mods.drift, 14);
            mods.retain = 1;
            mods.flash = Math.max(mods.flash, snap * 0.15);
            mods.bloom = Math.max(mods.bloom, 0.35);
        }
    },
    {
        key: '5',
        id: 'drift',
        name: 'drift',
        // Gives the vector field an overall direction so the whole frame
        // drags sideways like a botched camera pan.
        apply(m, mods, c) {
            mods.drift = Math.max(mods.drift, 20 + c.data.midNorm * 24);
            mods.bias = Math.sin(m.elapsed * 0.35) * (0.8 + c.energy * 0.7);
            mods.churn = 2.2;
            mods.iframe = Math.min(mods.iframe, 0.18);
            mods.retain = 1;
        }
    },
    {
        key: '6',
        id: 'shred',
        name: 'shred',
        // Tiny blocks, violent drift, fast churn: disintegrates into
        // streaks rather than blocks. Best in bursts.
        apply(m, mods, c) {
            mods.blockSize = 6;
            mods.drift = Math.max(mods.drift, 30 + c.data.trebleNorm * 30);
            mods.churn = 6;
            mods.iframe = Math.min(mods.iframe, 0.09);
            mods.moshBleed = Math.max(mods.moshBleed, 8);
            mods.retain = 1;
            void m;
        }
    },
    {
        key: '7',
        id: 'freeze',
        name: 'freeze',
        // Source stops moving, vectors keep running: the still picture eats
        // itself.
        apply(m, mods) {
            mods.sceneSpeed = 0;
            mods.iframe = Math.min(mods.iframe, 0.05);
            mods.drift = Math.max(mods.drift, 12);
            mods.retain = 1;
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
            mods.negative = m.state.b > 0.35 ? 1 : 0;
        }
    },
    {
        key: 'x',
        id: 'tear',
        name: 'tear',
        // Slice displacement on top of the mosh, for hard horizontal rips.
        apply(m, mods, c) {
            if (m.state.h === undefined) m.state.h = 0;
            if (c.beatTick) m.state.h = 1;
            m.state.h = Math.max(0, m.state.h - c.dt * 4);
            mods.glitchOffset = Math.max(mods.glitchOffset, m.state.h * 90);
            mods.glitchSlices = Math.max(mods.glitchSlices, 10);
        }
    },
    {
        key: 'p',
        id: 'pixel',
        name: 'pixel',
        apply(m, mods, c) {
            if (m.state.c === undefined) m.state.c = 0;
            if (c.beatTick) m.state.c = 1;
            m.state.c = Math.max(0, m.state.c - c.dt * 1.4);
            mods.pixelate = Math.max(mods.pixelate, 2 + m.state.c * 24);
        }
    },
    {
        key: 'g',
        id: 'glow',
        name: 'glow',
        apply(m, mods, c) {
            mods.bloom = Math.max(mods.bloom, 0.6 + beatPulse(c.data.beatPhase, 3) * 0.6);
            void m;
        }
    }
];

const SCENES: Scene[] = [
    { name: 'clean', enter: 0.0, modes: ['bleed'] },
    { name: 'soft rot', enter: 0.32, modes: ['slam', 'blocks'] },
    { name: 'melting', enter: 0.54, modes: ['melt', 'bleed', 'glow'] },
    { name: 'corrupt', enter: 0.72, modes: ['melt', 'drift', 'blocks', 'glow'] },
    { name: 'total loss', enter: 0.87, modes: ['shred', 'drift', 'negative', 'glow'] }
];

export function createDatamoshTheme(): PixiTheme {
    const engine = createModeEngine<Mods>({ modes: MODES, scenes: SCENES, freshMods, autoStartOn: true });

    let app: PixiThemeContext['app'] | null = null;
    let root: Container | null = null;
    let art: Graphics | null = null;
    let prevSprite: Sprite | null = null;
    let output: Sprite | null = null;

    let rtCurrent: RenderTexture | null = null;
    let rtNext: RenderTexture | null = null;
    let captureLayer: Container | null = null;

    let moshF: DatamoshFilter | null = null;
    let glitchF: GlitchFilter | null = null;
    let bloomF: AdvancedBloomFilter | null = null;
    let rgbF: RGBSplitFilter | null = null;
    let pixelF: PixelateFilter | null = null;
    let colorF: ColorMatrixFilter | null = null;

    let W = 0;
    let H = 0;
    let clock = 0;
    let sceneClock = 0;
    let onStatus: ((labels: string[], hint: string) => void) | null = null;

    function makeTextures() {
        rtCurrent?.destroy(true);
        rtNext?.destroy(true);
        rtCurrent = RenderTexture.create({ width: W, height: H });
        rtNext = RenderTexture.create({ width: W, height: H });
        if (output && rtCurrent) output.texture = rtCurrent;
        if (prevSprite && rtCurrent) prevSprite.texture = rtCurrent;
    }

    return {
        label: DATAMOSH_LABEL,
        keyHelp: engine.keyHelp(),

        setup(ctx: PixiThemeContext) {
            app = ctx.app;
            root = ctx.root;
            W = ctx.width;
            H = ctx.height;

            art = new Graphics();

            prevSprite = new Sprite();
            prevSprite.width = W;
            prevSprite.height = H;

            captureLayer = new Container();
            captureLayer.addChild(prevSprite, art);

            makeTextures();

            // The mosh filter needs a texture at construction time to bind its
            // second sampler, so the render textures are created first.
            moshF = new DatamoshFilter({ prevTexture: rtCurrent!, blockSize: 24, drift: 0, iframe: 1, bleed: 0 });
            glitchF = new GlitchFilter({ slices: 6, offset: 0 });
            captureLayer.filters = [moshF as unknown as Filter, glitchF as unknown as Filter];

            output = new Sprite();
            root.addChild(output);

            bloomF = new AdvancedBloomFilter({ threshold: 0.7, bloomScale: 0, blur: 6, quality: 4 });
            rgbF = new RGBSplitFilter();
            pixelF = new PixelateFilter(4);
            colorF = new ColorMatrixFilter();
            const chain = [pixelF, rgbF, bloomF, colorF] as unknown as Filter[];
            for (const f of chain) f.enabled = false;
            root.filters = chain;
        },

        destroy() {
            art?.destroy();
            prevSprite?.destroy();
            output?.destroy();
            rtCurrent?.destroy(true);
            rtNext?.destroy(true);
            rtCurrent = rtNext = null;
            if (root) root.filters = [];
            if (captureLayer) captureLayer.filters = [];
            captureLayer?.destroy();
            captureLayer = null;
            art = null;
            prevSprite = null;
            output = null;
            engine.reset();
        },

        onKey(key: string) {
            engine.onKey(key);
        },

        update(data: VisualizerData, dt: number, ctx: PixiThemeContext) {
            if (!art || !app || !prevSprite || !output || !captureLayer) return;

            if (ctx.width !== W || ctx.height !== H) {
                W = ctx.width;
                H = ctx.height;
                prevSprite.width = W;
                prevSprite.height = H;
                makeTextures();
            }

            const { mods } = engine.frame(data, dt);
            clock += dt;
            sceneClock += dt * mods.sceneSpeed;

            const t = sceneClock;
            const cx = W / 2;
            const cy = H / 2;
            const pulse = beatPulse(data.beatPhase, 4);

            // Source content, rebuilt to actually be worth destroying. Plain
            // scrolling bars gave the mosh nothing recognizable to tear apart,
            // datamosh looks incredible specifically because it's wrecking
            // something you can identify. This is a rotating emblem (a
            // multi-point star with a ring and a core) over a fine checker
            // grid, the grid gives small-scale detail so tiny blocks have
            // something to displace too, the emblem gives the eye something
            // to watch fall apart at any block size.
            art.clear();
            art.rect(0, 0, W, H).fill({ color: 0x0a0710 });

            // Fine checker grid: small-scale detail so the mosh reads clearly
            // even at tight block sizes.
            const cellSize = Math.max(14, Math.min(W, H) / 22);
            const cols = Math.ceil(W / cellSize) + 1;
            const rows = Math.ceil(H / cellSize) + 1;
            const gridScroll = t * 14;
            for (let gy = 0; gy < rows; gy++) {
                for (let gx = 0; gx < cols; gx++) {
                    if ((gx + gy) % 2 !== 0) continue;
                    const x = gx * cellSize - (gridScroll % (cellSize * 2));
                    const y = gy * cellSize;
                    const shade = (gx * 7 + gy * 13) % 5;
                    art.rect(x, y, cellSize, cellSize).fill({ color: PALETTE_HEX[shade], alpha: 0.22 });
                }
            }

            // Scrolling colour bars behind the emblem, kept from the original
            // but now a supporting layer rather than the whole scene.
            const barCols = 6;
            const barColW = W / barCols;
            for (let i = 0; i < barCols; i++) {
                const speed = 70 + (i % 3) * 40;
                const h = H * 0.3;
                const y = (i * 71 + t * speed) % (H + h) - h;
                const color = PALETTE_HEX[(i + Math.floor(t * 1.2)) % PALETTE_HEX.length];
                art.rect(i * barColW, y, barColW * 0.8, h).fill({ color, alpha: 0.5 });
            }

            // The emblem: an 8-point star, an inner counter-rotating ring of
            // ticks, and a bright core. Big, high-contrast, and instantly
            // recognizable, exactly the kind of shape that's satisfying to
            // watch tear into macroblocks.
            const emblemR = Math.min(W, H) * (0.3 + data.bassNorm * 0.05 + pulse * 0.02);
            const points = 8;
            const starPts: number[] = [];
            for (let i = 0; i < points * 2; i++) {
                const r = i % 2 === 0 ? emblemR : emblemR * 0.42;
                const a = t * 0.7 + (i / (points * 2)) * Math.PI * 2;
                starPts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            art.poly(starPts).fill({ color: PALETTE_HEX[2] });
            art.poly(starPts).stroke({ width: 4, color: 0xf4ecdf, alpha: 0.9 });

            // Counter-rotating tick ring, gives a second, faster-moving layer
            // right at the emblem's edge, useful contrast for the mosh drift.
            const tickCount = 20;
            for (let i = 0; i < tickCount; i++) {
                const a = -t * 1.6 + (i / tickCount) * Math.PI * 2;
                const r1 = emblemR * 0.55;
                const r2 = emblemR * 0.68;
                art
                    .moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
                    .lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
                    .stroke({ width: 3, color: PALETTE_HEX[(i + Math.floor(t)) % PALETTE_HEX.length] });
            }

            // Bright core, the highest-contrast point in the frame, this is
            // usually the first thing you'll see smear.
            const coreR = emblemR * (0.18 + pulse * 0.05);
            art.circle(cx, cy, coreR).fill({ color: 0xf4ecdf });
            art.circle(cx, cy, coreR * 1.4).stroke({ width: 3, color: PALETTE_HEX[4] });

            // The shader does the previous-frame compositing now, so the
            // sprite underneath is hidden - it exists only to keep the capture
            // layer's bounds at full frame size.
            prevSprite.alpha = 0;
            art.alpha = 1;

            if (moshF) {
                moshF.blockSize = mods.blockSize;
                moshF.drift = mods.drift;
                moshF.iframe = mods.iframe;
                moshF.bleed = mods.moshBleed;
                moshF.time = clock;
                moshF.churn = mods.churn;
                moshF.directionBias = mods.bias;
                moshF.retain = mods.retain;
                if (rtCurrent) moshF.setPrevTexture(rtCurrent);
            }

            if (rtNext) {
                app.renderer.render({ container: captureLayer, target: rtNext });
                const swap = rtCurrent;
                rtCurrent = rtNext;
                rtNext = swap;
                output.texture = rtCurrent!;
                prevSprite.texture = rtCurrent!;
            }

            if (glitchF) {
                glitchF.enabled = mods.glitchOffset > 0.5;
                glitchF.slices = Math.max(2, Math.round(mods.glitchSlices));
                glitchF.offset = mods.glitchOffset;
            }
            if (bloomF) {
                bloomF.enabled = mods.bloom > 0.01;
                bloomF.bloomScale = mods.bloom * 0.6;
            }
            if (rgbF) {
                rgbF.enabled = mods.rgbSplit > 0.01;
                const s = mods.rgbSplit * 12;
                rgbF.red = { x: -s, y: 0 } as never;
                rgbF.green = { x: 0, y: s * 0.5 } as never;
                rgbF.blue = { x: s, y: 0 } as never;
            }
            if (pixelF) {
                pixelF.enabled = mods.pixelate > 1.5;
                if (pixelF.enabled) pixelF.size = mods.pixelate;
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
import {
    Container,
    Graphics,
    Sprite,
    Texture,
    RenderTexture,
    ColorMatrixFilter,
    Filter
} from 'pixi.js';
import {
    AdvancedBloomFilter,
    RGBSplitFilter,
    TwistFilter,
    ZoomBlurFilter,
    GlitchFilter,
    ShockwaveFilter,
    BulgePinchFilter,
    PixelateFilter,
    DotFilter
} from 'pixi-filters';
import { KaleidoFilter } from './kaleidoFilter';
import { sectionTier } from './sectionMapping';
import { beatPulse } from '../beatPulse';
import { approach, decay, clamp01 } from '../smoothing';
import { PALETTE_HEX } from '../palette';
import type { VisualizerData } from '../types';
import type { PixiTheme, PixiThemeContext } from './types';

export const SUNBURST_LABEL = 'Sunburst';

const CREAM = 0xf4ecdf;
const INK = 0x08060e;
const RAY_COUNTS = [8, 14, 20, 30];
const CURL_POW: number[] = Array.from({ length: 33 }, (_, i) => Math.pow(i / 32, 1.35));

// ---------------------------------------------------------------------
// Modes. The mode/director architecture carries over from the Canvas
// version unchanged - it was always renderer-agnostic. What changes is
// what the mods drive: instead of hand-rolled pixel work, most of the
// heavy effects are now GPU filter parameters.
// ---------------------------------------------------------------------

interface Mods {
    // geometry
    zoomMul: number;
    spinRate: number;
    twistAdd: number;
    widthMul: number;
    rayOverride: number | null;
    colorAdd: number;
    bgDark: number;
    shakeX: number;
    shakeY: number;
    whip: number;
    flash: number;
    // GPU effects
    kaleido: number; // segment count, 0 = off
    kaleidoMix: number;
    kaleidoRotation: number;
    rayWhite: number; // rays punch out white instead of palette
    perRay: number; // per-ray spectrum modulation strength
    curlExponent: number; // how sharply curl concentrates toward the centre
    feedback: number; // true frame feedback (0-1)
    feedbackScale: number;
    negative: number;
    bloom: number;
    rgbSplit: number;
    twistFilter: number;
    zoomBlur: number;
    glitch: number;
    shockwave: number; // -1 = idle
    bulge: number;
    pixelate: number;
    halftone: number;
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
        shakeX: 0,
        shakeY: 0,
        whip: 0,
        flash: 0,
        kaleido: 0,
        kaleidoMix: 1,
        kaleidoRotation: 0,
        rayWhite: 0,
        perRay: 0,
        curlExponent: 1.35,
        feedback: 0,
        feedbackScale: 1.05,
        negative: 0,
        bloom: 0,
        rgbSplit: 0,
        twistFilter: 0,
        zoomBlur: 0,
        glitch: 0,
        shockwave: -1,
        bulge: 0,
        pixelate: 0,
        halftone: 0
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
    // ---- the original eight, restored -------------------------------
    {
        key: '1',
        id: 'strobe',
        name: 'strobe',
        // One hit per beat, not a continuous flicker.
        //
        // The previous version gated on `floor(beatPhase * 4) % 2`, which is
        // four cuts per beat - roughly 8 flashes a second at 128bpm. That is
        // both visually exhausting and squarely in the range that triggers
        // photosensitive reactions, which matters when it's pointed at a
        // room. This fires once per beat for a short window instead, so it
        // lands as a punch on the kick rather than a flicker.
        //
        // GATE_WIDTH is the fraction of the beat the hit is held for; raise
        // it for a longer, heavier slam, but leave the once-per-beat timing
        // alone unless you specifically want faster.
        apply(m, mods, c) {
            const GATE_WIDTH = 0.18;

            if (m.state.look === undefined) m.state.look = 0;
            if (c.beatTick) {
                m.state.look = Math.floor(Math.random() * 3);
                m.state.hit = 1;
                m.state.color = (m.state.color || 0) + 2;
            }
            m.state.hit = Math.max(0, (m.state.hit || 0) - c.dt * 6);

            const gate = c.data.beatPhase < GATE_WIDTH ? 1 : 0;

            if (m.state.look === 0) {
                // blackout ground, rays punch out white on the hit
                mods.bgDark = Math.max(mods.bgDark, 1);
                mods.rayWhite = Math.max(mods.rayWhite, gate);
            } else if (m.state.look === 1) {
                // whiteout on the hit, normal between
                mods.flash = Math.max(mods.flash, gate * 0.85);
            } else {
                // colour slam: palette jumps for the duration of the hit
                mods.colorAdd += gate ? 3 : 0;
                mods.bgDark = Math.max(mods.bgDark, gate * 0.9);
            }

            mods.colorAdd += Math.round(m.state.color || 0);
            mods.bloom = Math.max(mods.bloom, 0.5);
            mods.zoomMul *= 1 + (m.state.hit || 0) * 0.08;
        }
    },
    {
        key: '2',
        id: 'kaleido',
        name: 'kaleido',
        // Locked to the bar rather than drifting. Segments step through a
        // musical ladder on the downbeat, the fold rotation snaps in
        // quantised steps every beat instead of sliding continuously, and
        // the mirror strength breathes with beatPulse so the mandala pumps.
        apply(m, mods, c) {
            if (m.state.idx === undefined) {
                m.state.idx = 1;
                m.state.rot = 0;
            }
            const LADDER = [4, 6, 8, 12, 16];

            if (c.beatTick) {
                // New segment count every 2 beats, walking the ladder rather
                // than jumping randomly - it reads as a build.
                if (c.beatIndex % 2 === 0) {
                    m.state.idx = (m.state.idx + 1) % LADDER.length;
                }
                // Rotation snaps by an eighth of a segment on every beat.
                m.state.rot = ((m.state.rot || 0) + Math.PI / 8) % (Math.PI * 2);
            }

            mods.kaleido = LADDER[Math.floor(m.state.idx)];
            mods.kaleidoRotation = m.state.rot || 0;

            // mix is a fade-in only, and settles at exactly 1.
            //
            // Previously it oscillated between 0.75 and 1 to "pump" on the
            // beat, but mix < 1 blends the un-mirrored image back over the
            // mirrored one - so the mandala was permanently double-exposed
            // against the raw burst. That's what made it look washed out and
            // spiky rather than clean.
            mods.kaleidoMix = clamp01(m.elapsed / 0.3);

            // The pump now comes from scale, which doesn't corrupt the fold.
            mods.zoomMul *= 1 + beatPulse(c.data.beatPhase, 3) * 0.05;
            mods.bloom = Math.max(mods.bloom, 0.3);
        }
    },
    {
        key: '3',
        id: 'tunnel',
        name: 'tunnel',
        // True frame feedback, ping-ponged between two render textures on
        // the GPU. Same infinite-echo effect as the Canvas version but with
        // no per-frame readback, so it costs almost nothing.
        apply(m, mods, c) {
            if (m.state.dir === undefined) m.state.dir = 1;
            if (c.beatTick && c.beatIndex % 8 === 0) m.state.dir = m.state.dir > 0 ? -1 : 1;
            const ramp = clamp01(m.elapsed / 1.2);
            mods.feedback = Math.max(mods.feedback, 0.86 * ramp);
            mods.feedbackScale = m.state.dir > 0 ? 1.055 : 0.955;
            mods.spinRate += 0.25 * m.state.dir;
            mods.bloom = Math.max(mods.bloom, 0.3);
        }
    },
    {
        key: '4',
        id: 'quake',
        name: 'quake',
        // Shake, whip and glitch, plus a real shockwave ripple firing out
        // from the centre on every beat.
        apply(m, mods, c) {
            if (m.state.hit === undefined) m.state.hit = 0;
            if (c.beatTick) {
                m.state.hit = 1;
                m.state.whipDir = Math.random() > 0.5 ? 1 : -1;
                m.state.wave = 0;
            }
            m.state.hit = Math.max(0, m.state.hit - c.dt * 4.5);
            if (m.state.wave !== undefined && m.state.wave < 1.3) {
                m.state.wave += c.dt * 1.7;
                mods.shockwave = m.state.wave;
            }
            const h = m.state.hit;
            mods.shakeX += (Math.random() - 0.5) * h * 44;
            mods.shakeY += (Math.random() - 0.5) * h * 44;
            mods.whip += (m.state.whipDir || 1) * h * 0.16;
            mods.glitch = Math.max(mods.glitch, h * 0.9);
            mods.zoomMul *= 1 + h * 0.07;
        }
    },
    {
        key: '5',
        id: 'negative',
        name: 'negative',
        // Held inversion looked bad: inverting cream paper gives muddy navy
        // and turns the palette into its ugly complements. So it's now a
        // burst - a hard flip that snaps in on the beat and releases inside
        // ~120ms, reading as a punch rather than a colour scheme. It also
        // rides on a blackout ground, where the inverted palette actually
        // looks good.
        apply(m, mods, c) {
            if (m.state.burst === undefined) m.state.burst = 0;
            if (c.beatTick) m.state.burst = 1;
            m.state.burst = Math.max(0, m.state.burst - c.dt * 8);

            const on = m.state.burst > 0.35 ? 1 : 0;
            mods.negative = Math.max(mods.negative, on);
            mods.bgDark = Math.max(mods.bgDark, on ? 1 : 0);
            mods.bloom = Math.max(mods.bloom, on ? 0.7 : 0.25);

            // On big hits, double-flip inside the beat for a stutter.
            if (c.energy > 0.7 && Math.sin(m.elapsed * 40) > 0.6) {
                mods.negative = 1;
            }
        }
    },
    {
        key: '6',
        id: 'vortex',
        name: 'vortex',
        // Rebuilt as an actual vortex. The twist *filter* was smearing
        // pixels, which looked like a lens defect rather than rotation. This
        // drives the geometry instead: the curl exponent tightens so rays
        // wind harder the closer they get to the centre, the whole field
        // spins up, and it pulls inward - the shape itself spirals.
        apply(m, mods, c) {
            const ramp = clamp01(m.elapsed / 2.5);
            const breathe = 0.8 + 0.3 * Math.sin(m.elapsed * 0.5);

            mods.twistAdd += 5.2 * ramp * breathe;
            // Higher exponent = curl concentrated near the middle, which is
            // what makes it read as a drain rather than a pinwheel.
            mods.curlExponent = 1.35 + ramp * 1.5;
            mods.spinRate += 2.6 * ramp;
            // Slow inward pull, so rays appear to be swallowed.
            mods.zoomMul *= 1 + ramp * (0.25 + 0.12 * Math.sin(m.elapsed * 0.4));
            mods.widthMul *= 1 - 0.3 * ramp;
            mods.bloom = Math.max(mods.bloom, 0.25);
            void c;
        }
    },
    {
        key: '7',
        id: 'swarm',
        name: 'swarm',
        // The old version slid the ray *count* continuously, so rays popped
        // in and out mid-frame and it just looked glitchy. Now the count
        // only changes on the beat (musical, no popping), and instead each
        // ray gets its own width from its own slice of the spectrum - so the
        // fan flickers and swarms with the actual frequency content rather
        // than all moving as one block.
        apply(m, mods, c) {
            if (m.state.count === undefined) m.state.count = 24;
            if (c.beatTick) {
                const LADDER = [16, 24, 32, 44];
                const lift = Math.min(3, Math.floor(c.energy * 4));
                m.state.count = LADDER[lift];
            }
            mods.rayOverride = Math.floor(m.state.count);
            mods.perRay = Math.max(mods.perRay, 0.85);
            mods.widthMul *= 0.85;
            mods.spinRate += 0.6;
            mods.bloom = Math.max(mods.bloom, 0.3);
        }
    },
    {
        key: '8',
        id: 'drop',
        name: 'drop',
        // 8-beat phrase loop: creeps inward tightening, then SLAMS out on
        // the downbeat with a white hit and a shockwave.
        apply(m, mods, c) {
            if (m.state.slam === undefined) m.state.slam = 0;
            if (c.beatTick && c.beatIndex % 8 === 0) {
                m.state.slam = 1;
                m.state.wave = 0;
            }
            m.state.slam = Math.max(0, m.state.slam - c.dt * 1.6);
            if (m.state.wave !== undefined && m.state.wave < 1.3) {
                m.state.wave += c.dt * 1.5;
                mods.shockwave = Math.max(mods.shockwave, m.state.wave);
            }
            const phraseBeat = ((c.beatIndex % 8) + c.data.beatPhase) / 8;
            const build = phraseBeat * phraseBeat;
            mods.zoomMul *= (1 + build * 1.5) * (1 - m.state.slam * 0.62);
            mods.twistAdd += build * 1.6;
            mods.flash = Math.max(mods.flash, m.state.slam * 0.85);
            mods.bgDark = Math.max(mods.bgDark, m.state.slam * 0.9);
            mods.spinRate += build * 1.2;
            mods.bloom = Math.max(mods.bloom, build * 0.8);
        }
    },

    // ---- new, GPU-only ------------------------------------------------
    {
        key: 'g',
        id: 'glow',
        name: 'glow',
        // Heavy bloom breathing with the kick. Makes flat poster colour read
        // as emitted light - the single biggest "this looks expensive" win
        // from moving to the GPU.
        apply(m, mods, c) {
            const pulse = beatPulse(c.data.beatPhase, 3);
            mods.bloom = Math.max(mods.bloom, 0.7 + pulse * 0.7 + c.data.bassNorm * 0.5);
        }
    },
    {
        key: 'c',
        id: 'chroma',
        name: 'chroma',
        // True subpixel RGB separation, pulsing on the beat.
        apply(m, mods, c) {
            const pulse = beatPulse(c.data.beatPhase, 3);
            mods.rgbSplit = Math.max(mods.rgbSplit, 0.3 + pulse * 0.7 + c.data.bassNorm * 0.4);
        }
    },
    {
        key: 'p',
        id: 'pixel',
        name: 'pixel',
        // Resolution crushes down on the beat and recovers. Lo-fi, very
        // early-web, and it makes the palette read as flat blocks of colour.
        apply(m, mods, c) {
            if (m.state.crush === undefined) m.state.crush = 0;
            if (c.beatTick) m.state.crush = 1;
            m.state.crush = Math.max(0, m.state.crush - c.dt * 1.4);
            mods.pixelate = Math.max(mods.pixelate, 2 + m.state.crush * 26);
        }
    },
    {
        key: 'h',
        id: 'halftone',
        name: 'halftone',
        // Dot screen, like a blown-up print. Ties back to the riso look.
        apply(m, mods, c) {
            mods.halftone = Math.max(mods.halftone, 0.5 + c.data.midNorm * 0.6);
        }
    },
    {
        key: 'z',
        id: 'hyperspeed',
        name: 'hyperspeed',
        // Radial zoom blur that surges on the beat - light-speed jump.
        apply(m, mods, c) {
            if (m.state.surge === undefined) m.state.surge = 0;
            if (c.beatTick) m.state.surge = 1;
            m.state.surge = Math.max(0, m.state.surge - c.dt * 2);
            mods.zoomBlur = Math.max(mods.zoomBlur, 0.3 + m.state.surge * 0.7);
            mods.bloom = Math.max(mods.bloom, 0.4);
        }
    },
    {
        key: 'b',
        id: 'lens',
        name: 'lens',
        // Fisheye bulge breathing in and out. Warps the whole composition
        // without touching the geometry.
        apply(m, mods, c) {
            const ramp = clamp01(m.elapsed / 1.5);
            mods.bulge = Math.max(mods.bulge, ramp * (0.45 * Math.sin(m.elapsed * 0.5) + c.data.bassNorm * 0.3));
        }
    }
];

interface Scene {
    name: string;
    enter: number;
    modes: string[];
}

const SCENES: Scene[] = [
    { name: 'breakdown', enter: 0.0, modes: ['tunnel', 'glow'] },
    { name: 'groove', enter: 0.34, modes: ['vortex', 'glow', 'chroma'] },
    { name: 'build', enter: 0.55, modes: ['vortex', 'kaleido', 'glow'] },
    { name: 'peak', enter: 0.72, modes: ['strobe', 'quake', 'kaleido', 'glow', 'chroma'] },
    { name: 'blowout', enter: 0.87, modes: ['strobe', 'quake', 'kaleido', 'negative', 'swarm', 'hyperspeed', 'glow'] }
];

const SCENE_HYSTERESIS = 0.06;
const SCENE_MIN_DWELL = 6;

export function createSunburstPixiTheme(): PixiTheme {
    // scene graph
    let root: Container | null = null;
    let app: PixiThemeContext['app'] | null = null;
    let bg: Graphics | null = null;
    let rays: Graphics | null = null;
    let sceneLayer: Container | null = null;
    let feedbackLayer: Container | null = null;
    let flashSprite: Sprite | null = null;
    let W = 0;
    let H = 0;

    // filters
    let bloomF: AdvancedBloomFilter | null = null;
    let rgbF: RGBSplitFilter | null = null;
    let twistF: TwistFilter | null = null;
    let zoomF: ZoomBlurFilter | null = null;
    let glitchF: GlitchFilter | null = null;
    let shockF: ShockwaveFilter | null = null;
    let bulgeF: BulgePinchFilter | null = null;
    let kaleidoF: KaleidoFilter | null = null;
    let pixelF: PixelateFilter | null = null;
    let dotF: DotFilter | null = null;
    let colorF: ColorMatrixFilter | null = null;

    // Ping-pong render textures for true frame feedback. Two are needed
    // because a single one would be read and written in the same pass.
    let rtA: RenderTexture | null = null;
    let rtB: RenderTexture | null = null;
    let echoSprite: Sprite | null = null;

    // audio/state
    let rotation = 0;
    let centreDrift = 0;
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
    let lastSection: string | undefined;
    let sectionEngaged = false;

    let onStatus: ((labels: string[], hint: string) => void) | null = null;
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

    return {
        label: SUNBURST_LABEL,

        keyHelp: [
            ...MODES.map((m) => [m.key, m.name] as [string, string]),
            ['a', 'AUTO (energy)'],
            ['9', 'reverse'],
            ['0', 'all off'],
            ['r', 'ray count']
        ],

        setup(ctx: PixiThemeContext) {
            root = ctx.root;
            app = ctx.app;
            W = ctx.width;
            H = ctx.height;

            bg = new Graphics();
            rays = new Graphics();

            // Feedback echo: a sprite showing the previous frame, sitting
            // behind the burst. Scaled slightly each frame it compounds into
            // an infinite tunnel.
            rtA = RenderTexture.create({ width: W, height: H });
            rtB = RenderTexture.create({ width: W, height: H });
            echoSprite = new Sprite(rtA);
            echoSprite.anchor.set(0.5);
            echoSprite.position.set(W / 2, H / 2);
            echoSprite.alpha = 0;

            flashSprite = new Sprite(Texture.WHITE);
            flashSprite.width = W;
            flashSprite.height = H;
            flashSprite.alpha = 0;

            // Layering matters for the feedback loop:
            //   root            <- the filter chain lives here
            //     feedbackLayer <- this is what gets captured each frame
            //       bg
            //       echoSprite  <- previous capture, drawn behind the burst
            //       sceneLayer  <- the burst, and the only thing transformed
            //     flashSprite   <- above everything, never captured or scaled
            //
            // The earlier version captured `root` itself, which meant every
            // frame re-applied the whole filter chain to the already-filtered
            // echo. Bloom and kaleido compounded on themselves and the image
            // ran away - that was the "fucked up" tunnel.
            sceneLayer = new Container();
            sceneLayer.addChild(rays);
            feedbackLayer = new Container();
            feedbackLayer.addChild(bg, echoSprite, sceneLayer);
            root.addChild(feedbackLayer, flashSprite);

            // Filters are created once and toggled with .enabled rather than
            // being added and removed. Each enabled filter is a full-screen
            // pass, so leaving unused ones disabled genuinely matters, but
            // rebuilding the array would force pipeline recompiles.
            twistF = new TwistFilter({ radius: Math.min(W, H) * 0.6, angle: 0, offset: { x: W / 2, y: H / 2 } });
            bulgeF = new BulgePinchFilter({ center: { x: 0.5, y: 0.5 }, radius: Math.min(W, H) * 0.7, strength: 0 });
            kaleidoF = new KaleidoFilter({ segments: 6, centre: { x: W / 2, y: H / 2 }, mix: 1 });
            zoomF = new ZoomBlurFilter({ strength: 0, center: { x: W / 2, y: H / 2 }, innerRadius: 60 });
            shockF = new ShockwaveFilter({ center: { x: W / 2, y: H / 2 }, amplitude: 24, wavelength: 140, speed: 900 });
            glitchF = new GlitchFilter({ slices: 8, offset: 0 });
            pixelF = new PixelateFilter(4);
            dotF = new DotFilter({ scale: 1, angle: 5 });
            rgbF = new RGBSplitFilter();
            // Threshold kept high and scale modest on purpose: a low threshold
            // bloomed the mid-tones too and washed the flat poster colours out to
            // pastel, which was visible as a milky look on everything.
            bloomF = new AdvancedBloomFilter({ threshold: 0.72, bloomScale: 0, blur: 6, quality: 4 });
            colorF = new ColorMatrixFilter();

            const chain: Filter[] = [
                twistF, bulgeF, kaleidoF, zoomF, shockF,
                glitchF, pixelF, dotF, rgbF, bloomF, colorF
            ];
            for (const f of chain) f.enabled = false;
            root.filters = chain;
        },

        destroy() {
            bg?.destroy();
            rays?.destroy();
            flashSprite?.destroy();
            echoSprite?.destroy();
            rtA?.destroy(true);
            rtB?.destroy(true);
            rtA = rtB = null;
            echoSprite = null;
            if (root) root.filters = [];
            bg = rays = null;
            flashSprite = null;
            root = null;
            active.clear();
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

        update(data: VisualizerData, dt: number, ctx: PixiThemeContext) {
            if (!rays || !bg || !flashSprite) return;

            if (ctx.width !== W || ctx.height !== H) {
                W = ctx.width;
                H = ctx.height;
                flashSprite.width = W;
                flashSprite.height = H;
                if (twistF) twistF.offset = { x: W / 2, y: H / 2 } as never;
                if (zoomF) zoomF.center = { x: W / 2, y: H / 2 } as never;
                if (shockF) shockF.center = { x: W / 2, y: H / 2 } as never;
                if (kaleidoF) kaleidoF.setCentre(W / 2, H / 2);
                // Render textures are fixed-size, so a resize needs new ones.
                rtA?.destroy(true);
                rtB?.destroy(true);
                rtA = RenderTexture.create({ width: W, height: H });
                rtB = RenderTexture.create({ width: W, height: H });
                if (echoSprite) {
                    echoSprite.texture = rtA;
                    echoSprite.position.set(W / 2, H / 2);
                }
            }

            // ---- audio + director (unchanged from the canvas version) -----
            smoothBass = approach(smoothBass, data.bassNorm, 6, dt);
            smoothMid = approach(smoothMid, data.midNorm, 3, dt);
            smoothTreble = approach(smoothTreble, data.trebleNorm, 2.5, dt);

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

            const mctx: ModeCtx = { data, dt, beatTick, beatIndex, energy };
            mods = freshMods();
            for (const mode of active.values()) {
                mode.elapsed += dt;
                mode.def.apply(mode, mods, mctx);
            }

            hintTimer = decay(hintTimer, 1, dt);
            rotation += dt * (0.06 + data.intensity * 0.2) * direction;
            modeSpin += mods.spinRate * dt * direction;
            centreDrift += dt * 0.35;

            const targetTwist = 0.5 + smoothBass * 1.4 * (0.4 + data.intensity) + mods.twistAdd;
            twist = approach(twist, targetTwist, 2.4, dt);
            zoomCurrent = approach(zoomCurrent, mods.zoomMul, 9, dt);

            // ---- rebuild the ray geometry ---------------------------------
            // Graphics.clear() + re-issue is the Pixi equivalent of redrawing,
            // but the resulting geometry is uploaded once and rasterised on the
            // GPU rather than scanline-filled on the CPU.
            const pulse = beatPulse(data.beatPhase, 5);
            const dark = clamp01(mods.bgDark);
            const bgColor = dark > 0.5 ? INK : CREAM;

            bg.clear();
            bg.rect(0, 0, W, H).fill({ color: bgColor });

            const cx = W * (0.5 + Math.cos(centreDrift * 0.6) * 0.13);
            const cy = H * (0.46 + Math.sin(centreDrift * 0.8) * 0.13);
            const maxR = (Math.hypot(W, H) * 1.15) / Math.max(0.18, zoomCurrent);
            const rayCount = mods.rayOverride ?? RAY_COUNTS[rayCountIndex];
            const step = (Math.PI * 2) / rayCount;
            const colorShift = colorOffset + mods.colorAdd;

            rays.clear();

            const spectrum = data.spectrumNorm;
            // When the curl exponent is being driven (vortex), the cached
            // pow table no longer matches, so it's computed live for those
            // frames only - the table still covers the common case.
            const useTable = Math.abs(mods.curlExponent - 1.35) < 0.001;

            for (let i = 0; i < rayCount; i++) {
                const a0 = rotation + i * step;

                // Per-ray modulation: each ray reads its own slice of the
                // spectrum, so the fan reacts band by band instead of every ray
                // moving identically.
                let widthScale = 1;
                let lengthScale = 1;
                if (mods.perRay > 0.01 && spectrum.length) {
                    const bin = spectrum[Math.floor((i / rayCount) * spectrum.length)] || 0;
                    widthScale = 1 + mods.perRay * (bin * 1.9 - 0.55);
                    lengthScale = 0.55 + bin * 0.75;
                }

                const width = step * (0.42 + smoothMid * 0.28) * mods.widthMul * Math.max(0.08, widthScale);
                const a1 = a0 + width;
                const curl = twist * (i % 2 === 0 ? 1 : 0.72) * direction;
                const steps = Math.max(4, Math.min(16, Math.ceil(4 + Math.abs(curl) * 5)));
                const rayR = maxR * lengthScale;

                const curlAt = (t: number) =>
                    useTable ? CURL_POW[(t * 32) | 0] : Math.pow(t, mods.curlExponent);

                const pts: number[] = [cx, cy];
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const r = t * rayR;
                    const a = a0 + curl * curlAt(t);
                    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                }
                for (let s = steps; s >= 0; s--) {
                    const t = s / steps;
                    const r = t * rayR;
                    const a = a1 + curl * curlAt(t);
                    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                }

                const paletteColor =
                    PALETTE_HEX[(((i + colorShift) % PALETTE_HEX.length) + PALETTE_HEX.length) % PALETTE_HEX.length];
                const color = mods.rayWhite > 0.5 ? 0xffffff : paletteColor;
                rays.poly(pts).fill({ color });

                // Fan lines. Still bounded, but no longer the bottleneck - these
                // are GPU-rasterised strokes now rather than CPU path stroking.
                if (i % 2 === 0 && rayCount <= 30 && smoothTreble > 0.02) {
                    const MAX_LINES = 9;
                    const visible = smoothTreble * MAX_LINES;
                    const lineColor =
                        PALETTE_HEX[(((i + colorShift + 2) % PALETTE_HEX.length) + PALETTE_HEX.length) % PALETTE_HEX.length];

                    for (let l = 1; l <= MAX_LINES; l++) {
                        const alpha = clamp01(visible - (l - 1));
                        if (alpha <= 0.01) break;
                        const lt = l / (MAX_LINES + 1);
                        const la = a1 + width * 0.55 * lt;
                        const lineSteps = 6;
                        for (let st = 0; st <= lineSteps; st++) {
                            const t = 0.12 + (st / lineSteps) * 0.68;
                            const r = t * rayR;
                            const a = la + curl * curlAt(t);
                            const x = cx + Math.cos(a) * r;
                            const y = cy + Math.sin(a) * r;
                            if (st === 0) rays.moveTo(x, y);
                            else rays.lineTo(x, y);
                        }
                        rays.stroke({ width: 1.4, color: lineColor, alpha });
                    }
                }
            }

            // Centre disc.
            const discR = Math.min(W, H) * (0.035 + smoothBass * 0.045 + pulse * 0.018);
            rays.circle(cx, cy, discR).fill({ color: mods.rayWhite > 0.5 ? INK : bgColor });
            rays
                .circle(cx, cy, discR)
                .stroke({ width: 3, color: PALETTE_HEX[(((colorShift + 2) % PALETTE_HEX.length) + PALETTE_HEX.length) % PALETTE_HEX.length] });

            // ---- transform + flash -----------------------------------------
            // Only the burst is transformed. The flash sits outside it, so it
            // no longer needs counter-scaling to stay full-frame.
            sceneLayer!.pivot.set(cx, cy);
            sceneLayer!.position.set(cx + mods.shakeX, cy + mods.shakeY);
            sceneLayer!.rotation = modeSpin + mods.whip;
            sceneLayer!.scale.set(zoomCurrent);

            flashSprite.alpha = Math.min(1, mods.flash);

            // ---- drive the GPU filters --------------------------------------
            // Each is enabled only when actually doing something: an enabled
            // filter costs a full-screen pass whether or not its parameters
            // are at zero.
            if (bloomF) {
                bloomF.enabled = mods.bloom > 0.01;
                bloomF.bloomScale = mods.bloom * 0.55;
            }
            if (rgbF) {
                rgbF.enabled = mods.rgbSplit > 0.01;
                const sp = mods.rgbSplit * 10;
                rgbF.red = { x: -sp, y: 0 } as never;
                rgbF.green = { x: 0, y: sp * 0.6 } as never;
                rgbF.blue = { x: sp, y: -sp * 0.4 } as never;
            }
            if (twistF) {
                twistF.enabled = mods.twistFilter > 0.01;
                twistF.angle = mods.twistFilter * 4.5;
            }
            if (zoomF) {
                zoomF.enabled = mods.zoomBlur > 0.01;
                zoomF.strength = mods.zoomBlur * 0.5;
            }
            if (glitchF) {
                glitchF.enabled = mods.glitch > 0.02;
                glitchF.offset = mods.glitch * 70;
                glitchF.slices = 6 + Math.floor(mods.glitch * 8);
            }
            if (shockF) {
                shockF.enabled = mods.shockwave >= 0 && mods.shockwave < 1.3;
                if (shockF.enabled) shockF.time = mods.shockwave;
            }
            if (bulgeF) {
                bulgeF.enabled = Math.abs(mods.bulge) > 0.01;
                bulgeF.strength = mods.bulge;
            }
            if (kaleidoF) {
                kaleidoF.enabled = mods.kaleido >= 3;
                if (kaleidoF.enabled) {
                    kaleidoF.segments = mods.kaleido;
                    kaleidoF.mix = mods.kaleidoMix;
                    kaleidoF.rotation = mods.kaleidoRotation;
                    // Fold around the burst's actual convergence point, not the
                    // canvas centre. cx/cy drift by up to 13% of the frame, and
                    // when the fold centre and the ray centre disagree the mirror
                    // slices through the rays off-axis - which is why it came out
                    // as jagged spikes instead of a mandala. The scene layer
                    // pivots on the same point, so it stays put under zoom and
                    // rotation; only shake displaces it.
                    kaleidoF.setCentre(cx + mods.shakeX, cy + mods.shakeY);
                }
            }
            if (pixelF) {
                pixelF.enabled = mods.pixelate > 1.5;
                if (pixelF.enabled) pixelF.size = mods.pixelate;
            }
            if (dotF) {
                dotF.enabled = mods.halftone > 0.01;
                if (dotF.enabled) dotF.scale = 0.6 + mods.halftone * 0.9;
            }
            if (colorF) {
                colorF.enabled = mods.negative > 0.5;
                if (colorF.enabled) {
                    colorF.reset();
                    colorF.negative(true);
                }
            }

            // ---- feedback echo (ping-pong render textures) ------------------
            if (echoSprite && rtA && rtB && app) {
                echoSprite.alpha = mods.feedback;
                if (mods.feedback > 0.01) {
                    echoSprite.scale.set(mods.feedbackScale);
                    echoSprite.rotation += dt * 0.02;
                    // Render this frame into the spare texture, then swap: the
                    // sprite always displays last frame's texture, so nothing is
                    // read and written in the same pass.
                    app.renderer.render({ container: feedbackLayer!, target: rtB });
                    const swap = rtA;
                    rtA = rtB;
                    rtB = swap;
                    echoSprite.texture = rtA;
                } else {
                    echoSprite.scale.set(1);
                    echoSprite.rotation = 0;
                }
            }

            // ---- report status to the UI overlay ----------------------------
            if (onStatus) {
                const labels: string[] = [];
                if (autoOn) labels.push(`AUTO (${sectionEngaged ? 'section' : 'energy'}) ${SCENES[autoScene].name}`);
                for (const m of active.values()) labels.push(m.def.name);
                onStatus(labels, hintTimer > 0.01 ? hintText : '');
            }
        },

        // Lets the React layer render the HUD instead of drawing text into
        // the scene, which keeps the filter stack from distorting it.
        setStatusHandler(fn: (labels: string[], hint: string) => void) {
            onStatus = fn;
        }
    } as PixiTheme & { setStatusHandler(fn: (labels: string[], hint: string) => void): void };
}
import { beatPulse } from '@/lib/beatPulse';
import { paletteRgba, PALETTE } from '@/lib/palette';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const CHROME_LABEL = 'Chrome';

// The stop pattern that makes a linear gradient read as polished metal:
// tight alternation between blown-out white and near-black, with soft
// mid-greys between. Evenly spaced greys just look like plastic.
const CHROME_STOPS: Array<[number, string]> = [
    [0.0, '#9aa0ae'],
    [0.1, '#ffffff'],
    [0.22, '#5c626f'],
    [0.34, '#e9ecf3'],
    [0.46, '#2b303a'],
    [0.58, '#ffffff'],
    [0.7, '#7a8090'],
    [0.82, '#f2f4f8'],
    [0.93, '#454b57'],
    [1.0, '#c8cdd8']
];

// "Chrome": liquid Y2K metal. Concentric chrome tubes coil around a
// glowing airbrushed core, riding on a bed of horizontal chrome bands.
// The gradient angle rotates continuously so highlights sweep across
// the metal, the coil warps with the spectrum, and the core colour
// cycles through the palette on each beat. Speckle grain on top.
export function createChromeTheme(): VisualizerTheme {
    let gradientAngle = 0;
    let bandScroll = 0;
    let coilPhase = 0;
    let colorIndex = 0;
    let latest: VisualizerData | null = null;
    let wasBeat = false;
    let flash = 0;

    function chromeGradient(
        ctx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        length: number,
        angle: number
    ): CanvasGradient {
        const dx = Math.cos(angle) * length * 0.5;
        const dy = Math.sin(angle) * length * 0.5;
        const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        for (const [pos, color] of CHROME_STOPS) g.addColorStop(pos, color);
        return g;
    }

    return {
        label: CHROME_LABEL,

        init() {
            gradientAngle = 0;
            bandScroll = 0;
            coilPhase = 0;
            colorIndex = 0;
            flash = 0;
            latest = null;
            wasBeat = false;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            // Sweeping highlights: the single most important motion for
            // selling metal.
            gradientAngle += dt * (0.35 + data.intensity * 0.9);
            bandScroll += dt * (12 + data.midNorm * 60);
            coilPhase += dt * (0.4 + data.trebleNorm * 1.2);

            if (data.beat && !wasBeat) {
                colorIndex = (colorIndex + 1) % PALETTE.length;
                flash = 1;
            }
            wasBeat = data.beat;
            flash = Math.max(0, flash - dt * 3);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;
            const pulse = beatPulse(data.beatPhase, 4);
            const base = Math.min(canvas.width, canvas.height);
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            ctx.fillStyle = '#0a0a0d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- horizontal chrome bands -----------------------------------
            // Each band gets its own vertical chrome gradient, so the
            // background reads as ridged brushed metal.
            const bandHeight = Math.max(14, canvas.height / 18);
            const offset = bandScroll % (bandHeight * 2);
            for (let y = -bandHeight * 2 + offset; y < canvas.height + bandHeight; y += bandHeight) {
                ctx.fillStyle = chromeGradient(ctx, cx, y + bandHeight / 2, bandHeight, Math.PI / 2 + gradientAngle * 0.15);
                ctx.fillRect(0, y, canvas.width, bandHeight);
            }

            // Darken the bands so the foreground coil separates from them.
            ctx.fillStyle = 'rgba(6, 6, 10, 0.55)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- airbrushed colour core --------------------------------------
            // The glow sits behind the metal, so highlights read as reflecting
            // a coloured light source.
            const coreR = base * (0.2 + data.bassNorm * 0.1 + pulse * 0.03);
            const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
            core.addColorStop(0, paletteRgba(colorIndex, 0.85 + flash * 0.15));
            core.addColorStop(0.35, paletteRgba(colorIndex, 0.4));
            core.addColorStop(1, paletteRgba(colorIndex, 0));
            ctx.fillStyle = core;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- chrome coil --------------------------------------------------
            // Concentric tubes, each offset along a wandering path so they
            // stack like a coiled ribbon rather than flat rings.
            const tubes = 9;
            const tubeWidth = base * (0.052 + data.midNorm * 0.014);
            const spectrum = data.spectrumNorm;

            for (let i = tubes - 1; i >= 0; i--) {
                const t = i / tubes;
                const radius = base * (0.13 + t * 0.30);
                // Each tube drifts on its own little orbit.
                const wobbleA = coilPhase * (0.6 + t * 0.5) + t * Math.PI * 1.5;
                const ox = Math.cos(wobbleA) * base * 0.055 * (0.4 + data.trebleNorm);
                const oy = Math.sin(wobbleA * 1.3) * base * 0.045 * (0.4 + data.trebleNorm);

                // Spectrum warps the tube thickness so the metal breathes.
                const bin = spectrum.length ? spectrum[Math.floor(t * spectrum.length)] : 0;
                const width = tubeWidth * (0.7 + bin * 0.9 + pulse * 0.12);

                ctx.strokeStyle = chromeGradient(
                    ctx,
                    cx + ox,
                    cy + oy,
                    radius * 2,
                    gradientAngle + t * 0.8
                );
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.beginPath();
                // Leaving a gap makes it read as a coil with an opening, not a
                // closed donut.
                ctx.arc(cx + ox, cy + oy, radius, wobbleA * 0.3, wobbleA * 0.3 + Math.PI * 1.72);
                ctx.stroke();

                // Specular seam running along the top of each tube.
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + pulse * 0.2})`;
                ctx.lineWidth = Math.max(1, width * 0.12);
                ctx.beginPath();
                ctx.arc(cx + ox, cy + oy - width * 0.26, radius, wobbleA * 0.3 + 0.2, wobbleA * 0.3 + Math.PI * 1.4);
                ctx.stroke();
            }

            // --- bloom on the beat --------------------------------------------
            if (flash > 0.01) {
                ctx.globalCompositeOperation = 'lighter';
                const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.6);
                bloom.addColorStop(0, `rgba(255, 255, 255, ${flash * 0.22})`);
                bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = bloom;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.globalCompositeOperation = 'source-over';
            }

            // --- speckle grain -------------------------------------------------
            // Sparse random specks, the cheap way to get that airbrushed
            // print texture without building a noise buffer every frame.
            const specks = 420;
            for (let i = 0; i < specks; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const bright = Math.random() > 0.5;
                ctx.fillStyle = bright ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.12)';
                ctx.fillRect(x, y, 1.5, 1.5);
            }
        }
    };
}
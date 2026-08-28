import { beatPulse } from '@/lib/beatPulse';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const RISO_LABEL = 'Riso';

// Riso inks: a warm orange and a cool blue, printed one pass each onto
// cream paper. Kept as raw rgb so the multiply blend stays predictable.
const INK_A = { r: 251, g: 86, b: 7 }; // #fb5607
const INK_B = { r: 58, g: 134, b: 255 }; // #3a86ff
const PAPER = '#f2ece0';

// "Riso": two-colour risograph print. Each ink lays down as its own
// halftone dot field, and the two passes are deliberately mis-aligned -
// that offset is what gives riso its look. Beats knock the registration
// further out and it drifts back, so hits feel like the press slipping.
// The dot fields themselves are driven by the spectrum, so the printed
// blobs bulge in time with the music.
export function createRisoTheme(): VisualizerTheme {
    let latest: VisualizerData | null = null;
    let phase = 0;
    let misreg = 0; // extra misregistration from the last beat
    let wasBeat = false;

    // The density field each ink prints. Returns 0-1 coverage for a point,
    // built from a couple of moving blobs whose radius is driven by the
    // spectrum, so the printed shapes move and swell with the audio.
    function density(
        nx: number,
        ny: number,
        data: VisualizerData,
        seed: number,
        band: number
    ): number {
        const spectrum = data.spectrumNorm;
        let total = 0;

        for (let b = 0; b < 3; b++) {
            const a = phase * (0.5 + b * 0.22) + seed + b * 2.1;
            const bx = 0.5 + Math.cos(a) * 0.28;
            const by = 0.5 + Math.sin(a * 1.24) * 0.28;
            const binIndex = Math.floor(((b + seed) * 7) % Math.max(1, spectrum.length));
            const bin = spectrum.length ? spectrum[binIndex] : 0;
            const radius = 0.16 + band * 0.14 + bin * 0.18;

            const d = Math.hypot(nx - bx, ny - by);
            // Smooth falloff, squared for a softer shoulder.
            const v = Math.max(0, 1 - d / radius);
            total += v * v;
        }

        return Math.min(1, total);
    }

    function printLayer(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        data: VisualizerData,
        ink: { r: number; g: number; b: number },
        offsetX: number,
        offsetY: number,
        stagger: number,
        seed: number,
        band: number,
        spacing: number
    ) {
        // Axis-aligned grid with staggered alternate rows. A rotated grid
        // looks marginally more authentic but forces you to iterate the
        // whole bounding diagonal, most of which lands off-screen; this
        // covers exactly the canvas and stays cheap at 1080p. Giving each
        // ink a different stagger keeps the two passes from moiring.
        const cols = Math.ceil(canvas.width / spacing) + 2;
        const rows = Math.ceil(canvas.height / spacing) + 2;
        const maxDot = spacing * 0.62;
        const invW = 1 / canvas.width;
        const invH = 1 / canvas.height;

        ctx.fillStyle = `rgb(${ink.r}, ${ink.g}, ${ink.b})`;

        for (let row = 0; row < rows; row++) {
            const y = (row - 1) * spacing + offsetY;
            if (y < -spacing || y > canvas.height + spacing) continue;

            const rowShift = (row % 2 === 0 ? 0 : spacing * 0.5) + stagger;

            for (let col = 0; col < cols; col++) {
                const x = (col - 1) * spacing + rowShift + offsetX;
                if (x < -spacing || x > canvas.width + spacing) continue;

                const cover = density(x * invW, y * invH, data, seed, band);
                if (cover <= 0.02) continue;

                const r = Math.sqrt(cover) * maxDot;
                if (r < 0.35) continue;

                // Filled one dot at a time on purpose: batching every dot into
                // a single path and filling once is dramatically slower under
                // multiply compositing, since the whole compound path gets
                // blended as one region.
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    return {
        label: RISO_LABEL,

        init() {
            latest = null;
            phase = 0;
            misreg = 0;
            wasBeat = false;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            phase += dt * (0.3 + data.intensity * 0.6);

            if (data.beat && !wasBeat) misreg = 1;
            wasBeat = data.beat;
            misreg = Math.max(0, misreg - dt * 2.2);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;
            const pulse = beatPulse(data.beatPhase, 4);

            ctx.fillStyle = PAPER;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Dot pitch scales with the canvas so the halftone stays the same
            // visual coarseness at any window size, with a floor so the dot
            // count stays bounded on large displays. Multiply-blended arcs are
            // the expensive part of this theme, so this is the knob to turn if
            // it ever feels heavy: raising the divisor makes it finer and
            // slower, lowering it coarser and faster.
            const spacing = Math.max(11, Math.min(canvas.width, canvas.height) / 58);

            // Baseline offset plus a beat-driven kick. Real riso is always a
            // little out; the beat just makes it worse for a moment.
            const drift = 2.5 + data.bassNorm * 3;
            const kick = misreg * 14;
            const ax = Math.cos(phase * 0.8) * drift + kick;
            const ay = Math.sin(phase * 0.7) * drift - kick * 0.6;

            // Multiply is what makes the overlap darken into a third colour,
            // exactly like two translucent inks on paper.
            ctx.globalCompositeOperation = 'multiply';

            printLayer(ctx, canvas, data, INK_A, ax, ay, 0, 0.0, data.bassNorm, spacing);
            printLayer(ctx, canvas, data, INK_B, -ax, -ay, spacing * 0.37, 3.7, data.trebleNorm, spacing * 1.08);

            ctx.globalCompositeOperation = 'source-over';

            // Paper grain: sparse specks in both inks, as if the press picked
            // up stray pigment.
            const specks = 170;
            for (let i = 0; i < specks; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const useA = Math.random() > 0.5;
                const ink = useA ? INK_A : INK_B;
                ctx.fillStyle = `rgba(${ink.r}, ${ink.g}, ${ink.b}, ${0.05 + Math.random() * 0.12})`;
                ctx.fillRect(x, y, 1.5, 1.5);
            }

            // Very light vignette so it sits like a physical print.
            const vig = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35,
                canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) * 0.6
            );
            vig.addColorStop(0, 'rgba(120, 100, 80, 0)');
            vig.addColorStop(1, `rgba(120, 100, 80, ${0.16 + pulse * 0.04})`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    };
}
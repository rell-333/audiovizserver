import { beatPulse } from '@/lib/beatPulse';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const PULSE_GRID_LABEL = 'Pulse Grid';

// "Pulse Grid": a grid of squares, each pulsing with bass/mid/treble,
// the whole grid flashes brighter on the beat-locked pulse and on a
// detected onset.
export function createPulseGridTheme(): VisualizerTheme {
    const cols = 12;
    const rows = 8;
    let beatFlash = 0;
    let latest: VisualizerData | null = null;

    return {
        label: PULSE_GRID_LABEL,

        init() {
            beatFlash = 0;
            latest = null;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            const pulse = beatPulse(data.beatPhase, 6);
            beatFlash = Math.max(beatFlash - dt * 2, data.beat ? 1 : 0, pulse * 0.5);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;

            ctx.fillStyle = '#050508';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cellW = canvas.width / cols;
            const cellH = canvas.height / rows;
            const bands = [data.bassNorm, data.midNorm, data.trebleNorm];

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const band = bands[(row + col) % 3] || 0;
                    const scale = 0.3 + band * (0.5 + data.intensity * 0.5) * 0.7;
                    const flashBoost = beatFlash * 0.3;
                    const size = Math.min(cellW, cellH) * (scale + flashBoost) * 0.8;
                    const cx = col * cellW + cellW / 2;
                    const cy = row * cellH + cellH / 2;

                    const hue = 260 - band * 200;
                    ctx.fillStyle = `hsla(${hue}, 75%, ${55 + beatFlash * 20}%, 0.9)`;
                    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
                }
            }
        }
    };
}
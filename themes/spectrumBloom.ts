import { beatPulse } from '@/lib/beatPulse';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const SPECTRUM_BLOOM_LABEL = 'Spectrum Bloom';

// "Spectrum Bloom": a radial bloom, spectrum bins pushed out from the
// centre as spokes, brightness driven by intensity and the beat-locked
// pulse.
export function createSpectrumBloomTheme(): VisualizerTheme {
    let rotation = 0;
    let latest: VisualizerData | null = null;

    return {
        label: SPECTRUM_BLOOM_LABEL,

        init() {
            rotation = 0;
            latest = null;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            rotation += dt * (0.2 + data.intensity * 0.6);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;

            ctx.fillStyle = 'rgba(5, 5, 8, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const pulse = beatPulse(data.beatPhase, 4);
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const spectrum = data.spectrumNorm || [];
            const maxRadius = Math.min(canvas.width, canvas.height) * 0.42;

            spectrum.forEach((value, i) => {
                const angle = rotation + (i / spectrum.length) * Math.PI * 2;
                const length = 20 + value * maxRadius * (0.4 + data.intensity * 0.8) * (0.8 + pulse * 0.4);
                const x1 = cx + Math.cos(angle) * 20;
                const y1 = cy + Math.sin(angle) * 20;
                const x2 = cx + Math.cos(angle) * length;
                const y2 = cy + Math.sin(angle) * length;

                const hue = (i * 6 + data.bpm) % 360;
                ctx.strokeStyle = `hsla(${hue}, 85%, ${60 + pulse * 20}%, ${0.6 + pulse * 0.3})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            });
        }
    };
}
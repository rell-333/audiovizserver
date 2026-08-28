import { beatPulse } from '@/lib/beatPulse';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const AURORA_LABEL = 'Aurora';

// "Aurora": soft vertical bands driven by the spectrum, colour drifts
// with the mid/treble balance, brightness swells on the beat-locked
// pulse with an extra flash on real detected onsets.
export function createAuroraTheme(): VisualizerTheme {
    let hueOffset = 0;
    let latest: VisualizerData | null = null;

    return {
        label: AURORA_LABEL,

        init() {
            hueOffset = 0;
            latest = null;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            hueOffset += dt * (10 + data.intensity * 40);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;

            ctx.fillStyle = 'rgba(5, 5, 8, 0.15)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const pulse = beatPulse(data.beatPhase, 4);
            const spectrum = data.spectrumNorm || [];
            const barWidth = canvas.width / spectrum.length;

            spectrum.forEach((value, i) => {
                const height = value * canvas.height * (0.4 + data.intensity * 0.8) * (0.75 + pulse * 0.25);
                const hue = (hueOffset + i * 4) % 360;
                ctx.fillStyle = `hsla(${hue}, 80%, ${55 + pulse * 15}%, 0.85)`;
                ctx.fillRect(i * barWidth, canvas.height - height, barWidth * 0.8, height);
            });

            const glowAlpha = pulse * 0.05 + (data.beat ? 0.08 : 0);
            if (glowAlpha > 0) {
                ctx.fillStyle = `rgba(255,255,255,${glowAlpha})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    };
}
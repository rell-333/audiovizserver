import { beatPulse } from '@/lib/beatPulse';
import { paletteRgba, randomPaletteIndex } from '@/lib/palette';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const STARFIELD_LABEL = 'Starfield';

interface Star {
    x: number;
    y: number;
    size: number;
    colorIndex: number;
    age: number;
    life: number;
    rotation: number;
    spin: number;
}

// "Starfield": stars bloom into existence at random positions in the
// house palette. A steady trickle keeps the sky alive, treble energy
// drives sparkle density (hats/cymbals scatter small stars), and beats
// burst out a cluster of larger ones. Each star flares in fast, holds,
// then fades, so the screen is always breathing rather than strobing.
export function createStarfieldTheme(): VisualizerTheme {
    let stars: Star[] = [];
    let latest: VisualizerData | null = null;
    let wasBeat = false;
    let spawnAccumulator = 0;

    const MAX_STARS = 260;

    function spawnStar(canvas: HTMLCanvasElement, sizeScale: number) {
        if (stars.length >= MAX_STARS) return;
        const life = 0.8 + Math.random() * 1.6;
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: (6 + Math.random() * 26) * sizeScale,
            colorIndex: randomPaletteIndex(),
            age: 0,
            life,
            rotation: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 1.2
        });
    }

    // A four-point sparkle: two tapered crossing spikes plus a soft core.
    function drawStar(
        ctx: CanvasRenderingContext2D,
        star: Star,
        alpha: number,
        scale: number
    ) {
        const len = star.size * scale;
        const thickness = Math.max(0.6, len * 0.10);

        ctx.save();
        ctx.translate(star.x, star.y);
        ctx.rotate(star.rotation);

        ctx.fillStyle = paletteRgba(star.colorIndex, alpha);

        // Long spike, then the same shape rotated 90 degrees.
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.moveTo(0, -len);
            ctx.lineTo(thickness, 0);
            ctx.lineTo(0, len);
            ctx.lineTo(-thickness, 0);
            ctx.closePath();
            ctx.fill();
            ctx.rotate(Math.PI / 2);
        }

        // Soft core glow.
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.45);
        glow.addColorStop(0, paletteRgba(star.colorIndex, alpha * 0.9));
        glow.addColorStop(1, paletteRgba(star.colorIndex, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, len * 0.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    return {
        label: STARFIELD_LABEL,

        init() {
            stars = [];
            latest = null;
            wasBeat = false;
            spawnAccumulator = 0;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;

            for (const star of stars) {
                star.age += dt;
                star.rotation += star.spin * dt;
            }
            stars = stars.filter((s) => s.age < s.life);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;
            const dt = 1 / 60; // spawn pacing only; motion uses real dt in update()

            // Long trails: stars leave a faint ghost as they fade.
            ctx.fillStyle = 'rgba(4, 4, 10, 0.16)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- spawning -----------------------------------------------
            // Steady trickle scaled by treble, so busy hi-hat sections
            // shimmer without needing an onset to trigger.
            const trickleRate = 2 + data.trebleNorm * 34 * (0.4 + data.intensity);
            spawnAccumulator += trickleRate * dt;
            while (spawnAccumulator >= 1) {
                spawnAccumulator -= 1;
                spawnStar(canvas, 0.45 + data.trebleNorm * 0.5);
            }

            // Beat burst: a cluster of bigger stars, sized by bass weight.
            if (data.beat && !wasBeat) {
                const burst = 5 + Math.floor(data.bassNorm * 14 * (0.5 + data.intensity));
                for (let i = 0; i < burst; i++) {
                    spawnStar(canvas, 0.9 + data.bassNorm * 1.1);
                }
            }
            wasBeat = data.beat;

            // --- render ---------------------------------------------------
            // 'lighter' makes overlapping stars bloom into white hot spots
            // instead of muddying, which is what sells the sparkle.
            ctx.globalCompositeOperation = 'lighter';

            const pulse = beatPulse(data.beatPhase, 5);

            for (const star of stars) {
                const t = star.age / star.life;
                // Flare in fast (first 15% of life), then ease out.
                const envelope = t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 1.6);
                const alpha = Math.max(0, envelope) * 0.95;
                // Everything breathes very slightly with the beat clock.
                const scale = (0.85 + envelope * 0.35) * (1 + pulse * 0.12);
                drawStar(ctx, star, alpha, scale);
            }

            ctx.globalCompositeOperation = 'source-over';
        }
    };
}
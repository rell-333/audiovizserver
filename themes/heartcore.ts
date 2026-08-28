import { beatPulse } from '@/lib/beatPulse';
import { paletteRgba, randomPaletteIndex, PALETTE } from '@/lib/palette';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const HEARTCORE_LABEL = 'Heartcore';

interface FloatingHeart {
    x: number;
    y: number;
    size: number;
    colorIndex: number;
    vy: number;
    drift: number;
    wobble: number;
    wobbleSpeed: number;
    age: number;
    life: number;
    spin: number;
    rotation: number;
}

// "Heartcore": a big glossy heart in the middle that thumps on every
// beat (scaled by bass, so it genuinely beats with the kick), with
// smaller hearts streaming upward in the palette colours, spawned by
// beats and treble. Rainbow candy gradient behind it, sparkles on top.
export function createHeartcoreTheme(): VisualizerTheme {
    let hearts: FloatingHeart[] = [];
    let latest: VisualizerData | null = null;
    let wasBeat = false;
    let backdropPhase = 0;
    let spawnAccumulator = 0;
    let thump = 0;

    const MAX_HEARTS = 90;

    // Classic two-lobe heart, drawn centred on (0,0) with a nominal size
    // of 1. Built inside the caller's transform.
    function heartPath(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.moveTo(0, -0.25);
        ctx.bezierCurveTo(-0.1, -0.55, -0.5, -0.6, -0.72, -0.35);
        ctx.bezierCurveTo(-0.98, -0.06, -0.82, 0.35, -0.42, 0.62);
        ctx.bezierCurveTo(-0.2, 0.78, -0.05, 0.9, 0, 1.0);
        ctx.bezierCurveTo(0.05, 0.9, 0.2, 0.78, 0.42, 0.62);
        ctx.bezierCurveTo(0.82, 0.35, 0.98, -0.06, 0.72, -0.35);
        ctx.bezierCurveTo(0.5, -0.6, 0.1, -0.55, 0, -0.25);
        ctx.closePath();
    }

    // Glossy heart: gradient fill, white rim, and a soft specular blob on
    // the upper-left lobe so it reads as shiny candy plastic.
    function drawHeart(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        rotation: number,
        colorIndex: number,
        alpha: number,
        glossy: boolean
    ) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(size, size);

        const grad = ctx.createLinearGradient(-1, -1, 1, 1);
        grad.addColorStop(0, 'rgba(255, 255, 255, ' + (0.9 * alpha) + ')');
        grad.addColorStop(0.35, paletteRgba(colorIndex, alpha));
        grad.addColorStop(1, paletteRgba(colorIndex + 1, alpha * 0.85));

        heartPath(ctx);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * alpha})`;
        ctx.lineWidth = 0.05;
        ctx.stroke();

        if (glossy) {
            ctx.save();
            ctx.clip();
            const spec = ctx.createRadialGradient(-0.36, -0.3, 0, -0.36, -0.3, 0.5);
            spec.addColorStop(0, `rgba(255, 255, 255, ${0.85 * alpha})`);
            spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = spec;
            ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
            ctx.restore();
        }

        ctx.restore();
    }

    function spawnHeart(canvas: HTMLCanvasElement, sizeScale: number) {
        if (hearts.length >= MAX_HEARTS) return;
        const base = Math.min(canvas.width, canvas.height);
        hearts.push({
            x: Math.random() * canvas.width,
            y: canvas.height + base * 0.06,
            size: base * (0.018 + Math.random() * 0.035) * sizeScale,
            colorIndex: randomPaletteIndex(),
            vy: -(40 + Math.random() * 120),
            drift: (Math.random() - 0.5) * 40,
            wobble: Math.random() * Math.PI * 2,
            wobbleSpeed: 1.2 + Math.random() * 2.2,
            age: 0,
            life: 3.5 + Math.random() * 3,
            spin: (Math.random() - 0.5) * 1.4,
            rotation: (Math.random() - 0.5) * 0.6
        });
    }

    return {
        label: HEARTCORE_LABEL,

        init() {
            hearts = [];
            latest = null;
            wasBeat = false;
            backdropPhase = 0;
            spawnAccumulator = 0;
            thump = 0;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            backdropPhase += dt * (0.15 + data.intensity * 0.3);

            for (const h of hearts) {
                h.age += dt;
                h.wobble += h.wobbleSpeed * dt;
                h.y += h.vy * dt;
                h.x += Math.sin(h.wobble) * h.drift * dt;
                h.rotation += h.spin * dt * 0.4;
            }
            hearts = hearts.filter((h) => h.age < h.life && h.y > -100);

            if (data.beat && !wasBeat) thump = 1;
            wasBeat = data.beat;
            thump = Math.max(0, thump - dt * 4);
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;
            const dt = 1 / 60; // spawn pacing only
            const pulse = beatPulse(data.beatPhase, 3);

            // --- rainbow candy backdrop -----------------------------------
            const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            bg.addColorStop(0, '#1a0b2e');
            bg.addColorStop(1, '#2d0b3d');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < PALETTE.length; i++) {
                const a = backdropPhase * 0.7 + (i / PALETTE.length) * Math.PI * 2;
                const bx = canvas.width * (0.5 + Math.cos(a) * 0.45);
                const by = canvas.height * (0.5 + Math.sin(a * 1.3) * 0.45);
                const br = Math.min(canvas.width, canvas.height) * (0.5 + data.bassNorm * 0.12);
                const blob = ctx.createRadialGradient(bx, by, 0, bx, by, br);
                blob.addColorStop(0, paletteRgba(i, 0.22 + pulse * 0.06));
                blob.addColorStop(1, paletteRgba(i, 0));
                ctx.fillStyle = blob;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.globalCompositeOperation = 'source-over';

            // --- spawn floating hearts ------------------------------------
            const trickle = 1.5 + data.trebleNorm * 16 * (0.4 + data.intensity);
            spawnAccumulator += trickle * dt;
            while (spawnAccumulator >= 1) {
                spawnAccumulator -= 1;
                spawnHeart(canvas, 0.8 + data.trebleNorm * 0.6);
            }
            if (data.beat && !wasBeat) {
                const burst = 3 + Math.floor(data.bassNorm * 8);
                for (let i = 0; i < burst; i++) spawnHeart(canvas, 1.1 + data.bassNorm * 0.8);
            }

            // --- floating hearts -------------------------------------------
            for (const h of hearts) {
                const t = h.age / h.life;
                const fadeIn = Math.min(1, t / 0.12);
                const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
                const alpha = Math.max(0, fadeIn * fadeOut) * 0.9;
                const bob = 1 + Math.sin(h.wobble) * 0.08;
                drawHeart(ctx, h.x, h.y, h.size * bob, h.rotation, h.colorIndex, alpha, true);
            }

            // --- the big centre heart ---------------------------------------
            // Thumps on the beat, swells with bass, and leans side to side so
            // it feels alive rather than just scaling.
            const base = Math.min(canvas.width, canvas.height);
            const heartSize = base * (0.16 + data.bassNorm * 0.05 + thump * 0.05 + pulse * 0.03);
            const lean = Math.sin(backdropPhase * 1.6) * 0.07;
            const cx = canvas.width / 2;
            const cy = canvas.height / 2 - heartSize * 0.2;

            // Glow behind it, blooms on each thump.
            const glowR = heartSize * (2.0 + thump * 0.7);
            const glow = ctx.createRadialGradient(cx, cy, heartSize * 0.4, cx, cy, glowR);
            glow.addColorStop(0, paletteRgba(2, 0.35 + thump * 0.25));
            glow.addColorStop(1, paletteRgba(2, 0));
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Squash-and-stretch on the thump for a rubbery heartbeat.
            const squash = 1 - thump * 0.10;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1 / squash, squash);
            drawHeart(ctx, 0, 0, heartSize, lean, 2, 1, true);
            ctx.restore();

            // --- sparkles ----------------------------------------------------
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 22; i++) {
                const seed = i * 91.7;
                const sx = ((Math.sin(seed) + 1) / 2) * canvas.width;
                const sy = ((Math.cos(seed * 2.3) + 1) / 2) * canvas.height;
                const twinkle = Math.abs(Math.sin(backdropPhase * 4 + i * 0.9));
                const size = (2 + twinkle * 5) * (0.5 + data.trebleNorm);
                ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + twinkle * 0.55})`;
                ctx.beginPath();
                ctx.moveTo(sx, sy - size);
                ctx.lineTo(sx + size * 0.26, sy);
                ctx.lineTo(sx, sy + size);
                ctx.lineTo(sx - size * 0.26, sy);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(sx - size, sy);
                ctx.lineTo(sx, sy + size * 0.26);
                ctx.lineTo(sx + size, sy);
                ctx.lineTo(sx, sy - size * 0.26);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        }
    };
}
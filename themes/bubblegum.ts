import { beatPulse } from '@/lib/beatPulse';
import { paletteRgba, randomPaletteIndex, PALETTE } from '@/lib/palette';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';

export const BUBBLEGUM_LABEL = 'Bubblegum';

interface Bubble {
    x: number;
    y: number;
    radius: number;
    colorIndex: number;
    vx: number;
    vy: number;
    wobble: number;
    wobbleSpeed: number;
    pop: number; // 0-1, extra scale from the last beat
    band: 0 | 1 | 2; // which frequency band this bubble listens to
}

// "Bubblegum": big glossy Y2K gel bubbles drifting and bouncing around,
// each one lit like an old Aqua button - radial body, white specular
// highlight, bright rim. Every bubble is tuned to bass, mid or treble so
// the cluster visibly separates into layers, and beats make them all
// squash-and-stretch pop. Backdrop is a slow-moving candy gradient.
export function createBubblegumTheme(): VisualizerTheme {
    let bubbles: Bubble[] = [];
    let latest: VisualizerData | null = null;
    let wasBeat = false;
    let backdropPhase = 0;
    let initialised = false;

    const BUBBLE_COUNT = 16;

    function seedBubbles(canvas: HTMLCanvasElement) {
        bubbles = [];
        const base = Math.min(canvas.width, canvas.height);
        for (let i = 0; i < BUBBLE_COUNT; i++) {
            bubbles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: base * (0.045 + Math.random() * 0.075),
                colorIndex: randomPaletteIndex(),
                vx: (Math.random() - 0.5) * 46,
                vy: (Math.random() - 0.5) * 46,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.8 + Math.random() * 1.6,
                pop: 0,
                band: (i % 3) as 0 | 1 | 2
            });
        }
    }

    // A glossy gel orb: soft outer glow, gradient body, specular highlight,
    // bright inner rim. Squash/stretch is applied via scale so pops feel
    // rubbery rather than just "bigger".
    function drawBubble(
        ctx: CanvasRenderingContext2D,
        b: Bubble,
        radius: number,
        squash: number
    ) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(1 / squash, squash);

        // Outer glow.
        const glow = ctx.createRadialGradient(0, 0, radius * 0.6, 0, 0, radius * 1.7);
        glow.addColorStop(0, paletteRgba(b.colorIndex, 0.5));
        glow.addColorStop(1, paletteRgba(b.colorIndex, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.7, 0, Math.PI * 2);
        ctx.fill();

        // Body: lit from the top-left, deepening toward the bottom-right.
        const body = ctx.createRadialGradient(
            -radius * 0.35, -radius * 0.4, radius * 0.08,
            0, 0, radius
        );
        body.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        body.addColorStop(0.35, paletteRgba(b.colorIndex, 0.95));
        body.addColorStop(1, paletteRgba(b.colorIndex, 0.55));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright inner rim, the "gel" edge.
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = Math.max(1, radius * 0.05);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.97, 0, Math.PI * 2);
        ctx.stroke();

        // Specular highlight, the thing that sells the plastic look.
        ctx.save();
        ctx.translate(-radius * 0.34, -radius * 0.42);
        ctx.rotate(-0.5);
        ctx.scale(1, 0.62);
        const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.42);
        spec.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Small secondary highlight bottom-right (bounce light).
        const bounce = ctx.createRadialGradient(
            radius * 0.4, radius * 0.45, 0,
            radius * 0.4, radius * 0.45, radius * 0.3
        );
        bounce.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        bounce.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = bounce;
        ctx.beginPath();
        ctx.arc(radius * 0.4, radius * 0.45, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    return {
        label: BUBBLEGUM_LABEL,

        init() {
            bubbles = [];
            latest = null;
            wasBeat = false;
            backdropPhase = 0;
            initialised = false;
        },

        update(data: VisualizerData, dt: number) {
            latest = data;
            backdropPhase += dt * (0.12 + data.intensity * 0.25);

            const speedScale = 0.5 + data.intensity;
            for (const b of bubbles) {
                b.x += b.vx * dt * speedScale;
                b.y += b.vy * dt * speedScale;
                b.wobble += b.wobbleSpeed * dt;
                b.pop = Math.max(0, b.pop - dt * 3);
            }

            if (data.beat && !wasBeat) {
                for (const b of bubbles) b.pop = 1;
            }
            wasBeat = data.beat;
        },

        draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
            if (!latest) return;
            const data = latest;

            if (!initialised) {
                seedBubbles(canvas);
                initialised = true;
            }

            // --- candy backdrop -------------------------------------------
            ctx.fillStyle = '#120a1e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Big soft colour blobs drifting around, blurred by sheer size.
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < PALETTE.length; i++) {
                const a = backdropPhase + (i / PALETTE.length) * Math.PI * 2;
                const bx = canvas.width * (0.5 + Math.cos(a * 0.8) * 0.42);
                const by = canvas.height * (0.5 + Math.sin(a * 1.1) * 0.42);
                const br = Math.min(canvas.width, canvas.height) * (0.42 + data.midNorm * 0.1);
                const blob = ctx.createRadialGradient(bx, by, 0, bx, by, br);
                blob.addColorStop(0, paletteRgba(i, 0.20));
                blob.addColorStop(1, paletteRgba(i, 0));
                ctx.fillStyle = blob;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.globalCompositeOperation = 'source-over';

            // --- bubbles ---------------------------------------------------
            const pulse = beatPulse(data.beatPhase, 4);
            const bands = [data.bassNorm, data.midNorm, data.trebleNorm];

            for (const b of bubbles) {
                // Bounce off the edges, using the bubble's own live radius.
                const bandValue = bands[b.band] || 0;
                const radius = b.radius * (0.72 + bandValue * 0.55 + b.pop * 0.22 + pulse * 0.06);

                if (b.x < radius) { b.x = radius; b.vx = Math.abs(b.vx); }
                if (b.x > canvas.width - radius) { b.x = canvas.width - radius; b.vx = -Math.abs(b.vx); }
                if (b.y < radius) { b.y = radius; b.vy = Math.abs(b.vy); }
                if (b.y > canvas.height - radius) { b.y = canvas.height - radius; b.vy = -Math.abs(b.vy); }

                // Squash-and-stretch: wide on the pop, settling back to round.
                const squash = 1 + Math.sin(b.wobble) * 0.04 - b.pop * 0.14;
                drawBubble(ctx, b, radius, squash);
            }

            // --- sparkle dust ------------------------------------------------
            // Cheap deterministic twinkles that shimmer with treble.
            ctx.globalCompositeOperation = 'lighter';
            const sparkleCount = 26;
            for (let i = 0; i < sparkleCount; i++) {
                const seed = i * 127.1;
                const sx = ((Math.sin(seed) + 1) / 2) * canvas.width;
                const sy = ((Math.cos(seed * 1.7) + 1) / 2) * canvas.height;
                const twinkle = Math.abs(Math.sin(backdropPhase * 3 + i));
                const size = (1.5 + twinkle * 4) * (0.5 + data.trebleNorm * 1.4);
                ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + twinkle * 0.5})`;
                ctx.beginPath();
                ctx.moveTo(sx, sy - size);
                ctx.lineTo(sx + size * 0.28, sy);
                ctx.lineTo(sx, sy + size);
                ctx.lineTo(sx - size * 0.28, sy);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(sx - size, sy);
                ctx.lineTo(sx, sy + size * 0.28);
                ctx.lineTo(sx + size, sy);
                ctx.lineTo(sx, sy - size * 0.28);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        }
    };
}
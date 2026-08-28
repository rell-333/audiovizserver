// Vector versions of the typographic star set (☆ ★ ✮ ⋆ ✩ ⊹ ⟡ ˚ ˖).
//
// Drawn as paths rather than text on purpose: a lot of that unicode set
// is missing from common system fonts and would render as tofu boxes on
// some machines, and text metrics make precise centring/rotation
// awkward. Paths render identically everywhere, stay sharp at any size,
// and let a glyph be filled or outlined on demand - the filled ★ against
// outline ☆ contrast is most of the charm of that set.

export type GlyphKind =
    | 'sparkle4' // ⋆ ✦ - pinched four-point
    | 'star5' // ★ - classic five-point
    | 'star6' // ✶ - six-point pinched
    | 'diamond' // ⟡ ⭒
    | 'ring' // ˚ ○
    | 'dot' // ݁ ·
    | 'cross'; // ⊹ ˖

export const GLYPH_KINDS: GlyphKind[] = [
    'sparkle4',
    'star5',
    'star6',
    'diamond',
    'ring',
    'dot',
    'cross'
];

// Builds a star polygon. `curved` pinches the concave sides with
// quadratic curves, which is what separates a sparkle (⋆) from a plain
// geometric star (★).
function starPath(
    ctx: CanvasRenderingContext2D,
    points: number,
    outer: number,
    inner: number,
    curved: boolean
) {
    ctx.beginPath();
    const stepAngle = Math.PI / points;

    for (let i = 0; i < points; i++) {
        const outerA = i * 2 * stepAngle - Math.PI / 2;
        const ox = Math.cos(outerA) * outer;
        const oy = Math.sin(outerA) * outer;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);

        const innerA = outerA + stepAngle;
        const ix = Math.cos(innerA) * inner;
        const iy = Math.sin(innerA) * inner;

        const nextA = outerA + 2 * stepAngle;
        const nx = Math.cos(nextA) * outer;
        const ny = Math.sin(nextA) * outer;

        if (curved) ctx.quadraticCurveTo(ix, iy, nx, ny);
        else {
            ctx.lineTo(ix, iy);
            ctx.lineTo(nx, ny);
        }
    }
    ctx.closePath();
}

// Draws one glyph centred on (x, y). Pass fill, stroke, or both.
export function drawGlyph(
    ctx: CanvasRenderingContext2D,
    kind: GlyphKind,
    x: number,
    y: number,
    size: number,
    rotation: number,
    fill: string | null,
    stroke: string | null = null,
    lineWidth = 1.5
) {
    if (size < 0.4) return;

    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);

    switch (kind) {
        case 'sparkle4':
            starPath(ctx, 4, size, size * 0.14, true);
            break;
        case 'star5':
            starPath(ctx, 5, size, size * 0.42, false);
            break;
        case 'star6':
            starPath(ctx, 6, size, size * 0.34, true);
            break;
        case 'diamond':
            starPath(ctx, 4, size, size * 0.62, false);
            break;
        case 'ring':
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.78, 0, Math.PI * 2);
            break;
        case 'dot':
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
            break;
        case 'cross': {
            // A thin four-way tick, like ⊹ - two tapered bars.
            const t = size * 0.13;
            ctx.beginPath();
            ctx.moveTo(-size, 0);
            ctx.lineTo(0, -t);
            ctx.lineTo(size, 0);
            ctx.lineTo(0, t);
            ctx.closePath();
            ctx.moveTo(0, -size);
            ctx.lineTo(t, 0);
            ctx.lineTo(0, size);
            ctx.lineTo(-t, 0);
            ctx.closePath();
            break;
        }
    }

    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    ctx.restore();
}
// Scratch canvases for post-processing effects (mirroring, feedback
// echo). Created through whatever the environment provides: browsers get
// OffscreenCanvas, and a headless test harness can polyfill it. Returns
// null if neither is available, so effects that need a buffer can simply
// skip rather than crash.

export interface ScratchBuffer {
    source: CanvasImageSource;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}

export function createScratchBuffer(width: number, height: number): ScratchBuffer | null {
    let source: CanvasImageSource | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    if (typeof OffscreenCanvas !== 'undefined') {
        const off = new OffscreenCanvas(width, height);
        source = off as unknown as CanvasImageSource;
        ctx = off.getContext('2d') as unknown as CanvasRenderingContext2D;
    } else if (typeof document !== 'undefined') {
        const el = document.createElement('canvas');
        el.width = width;
        el.height = height;
        source = el;
        ctx = el.getContext('2d');
    }

    if (!source || !ctx) return null;
    return { source, ctx, width, height };
}

// Returns a buffer matching the given size, reusing the existing one when
// the size hasn't changed (allocating a canvas every frame would be a
// disaster).
export function ensureBuffer(
    existing: ScratchBuffer | null,
    width: number,
    height: number
): ScratchBuffer | null {
    if (existing && existing.width === width && existing.height === height) return existing;
    return createScratchBuffer(width, height);
}
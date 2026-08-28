// Exponential smoothing toward a target, framerate independent.
//
// The naive version (`current += (target - current) * rate`) moves at a
// different speed depending on frame rate, which makes visuals feel
// different on a 60Hz vs 144Hz display. Using exp(-rate * dt) fixes the
// time constant in seconds instead.
//
// `rate` is roughly "how many e-foldings per second": 1 is very slow and
// floaty, 5 is responsive, 15 is nearly instant.
export function approach(current: number, target: number, rate: number, dt: number): number {
    return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// Decays a 0-1 impulse toward zero at a fixed rate, clamped.
export function decay(value: number, ratePerSecond: number, dt: number): number {
    return Math.max(0, value - ratePerSecond * dt);
}

// --- easing ---------------------------------------------------------
// All take and return 0-1. Used to shape event timelines so triggered
// animations accelerate and settle rather than moving linearly.

export function easeInCubic(t: number): number {
    return t * t * t;
}

export function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Overshoots past 1 before settling - good for snapping back from a
// zoom, where a straight ease looks limp.
export function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Clamps to 0-1, for building sub-timelines inside a longer event.
export function clamp01(t: number): number {
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Maps `value` from the range [inMin, inMax] onto 0-1, clamped. Handy
// for "this part of the event runs between t=0.3 and t=0.6".
export function phase(value: number, inMin: number, inMax: number): number {
    return clamp01((value - inMin) / (inMax - inMin));
}
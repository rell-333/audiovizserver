// The house palette. Shared across themes so the whole set feels like
// one visual identity rather than three unrelated screensavers.
export const PALETTE = ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'] as const;

export type PaletteColor = (typeof PALETTE)[number];

// Parsed once at module load so themes can build rgba() strings with a
// dynamic alpha every frame without re-parsing hex on the hot path.
const RGB: Array<[number, number, number]> = PALETTE.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]);

// rgba() string for palette entry `index` (wraps), at the given alpha.
export function paletteRgba(index: number, alpha = 1): string {
  const [r, g, b] = RGB[((index % RGB.length) + RGB.length) % RGB.length];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Picks a palette index at random.
export function randomPaletteIndex(): number {
  return Math.floor(Math.random() * PALETTE.length);
}

// Numeric form of the palette, for renderers that want colour as an
// integer rather than a CSS string (PixiJS, WebGL).
export const PALETTE_HEX: number[] = PALETTE.map((hex) => parseInt(hex.slice(1), 16));

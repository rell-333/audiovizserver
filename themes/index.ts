import { createAuroraTheme, AURORA_LABEL } from './aurora';
import { createPulseGridTheme, PULSE_GRID_LABEL } from './pulseGrid';
import { createSpectrumBloomTheme, SPECTRUM_BLOOM_LABEL } from './spectrumBloom';
import { createStarfieldTheme, STARFIELD_LABEL } from './starfield';
import { createBubblegumTheme, BUBBLEGUM_LABEL } from './bubblegum';
import { createHeartcoreTheme, HEARTCORE_LABEL } from './heartcore';
import { createSunburstTheme, SUNBURST_LABEL } from './sunburst';
import { createChromeTheme, CHROME_LABEL } from './chrome';
import { createRisoTheme, RISO_LABEL } from './riso';
import { createStarcoreTheme, STARCORE_LABEL } from './starcore';
import type { VisualizerTheme } from '@/lib/types';

// The single place that lists every available theme. Each theme module
// exports a create___Theme() factory returning a VisualizerTheme (see
// lib/types.ts) plus a label constant.
//
// To add a new theme: create a new file in this folder exporting a
// factory + label matching that pattern, import it below, and add it
// here. Nothing in app/page.tsx or the plugin/C++ code ever needs to
// change.
export const themeIds = [
    'starfield',
    'sunburst',
    'starcore',
    'chrome',
    'riso',
    'bubblegum',
    'heartcore',
    'aurora',
    'pulseGrid',
    'spectrumBloom'
] as const;

export type ThemeId = (typeof themeIds)[number];

export const themeLabels: Record<ThemeId, string> = {
    starfield: STARFIELD_LABEL,
    sunburst: SUNBURST_LABEL,
    starcore: STARCORE_LABEL,
    chrome: CHROME_LABEL,
    riso: RISO_LABEL,
    bubblegum: BUBBLEGUM_LABEL,
    heartcore: HEARTCORE_LABEL,
    aurora: AURORA_LABEL,
    pulseGrid: PULSE_GRID_LABEL,
    spectrumBloom: SPECTRUM_BLOOM_LABEL
};

export function createThemes(): Record<ThemeId, VisualizerTheme> {
    return {
        starfield: createStarfieldTheme(),
        sunburst: createSunburstTheme(),
        starcore: createStarcoreTheme(),
        chrome: createChromeTheme(),
        riso: createRisoTheme(),
        bubblegum: createBubblegumTheme(),
        heartcore: createHeartcoreTheme(),
        aurora: createAuroraTheme(),
        pulseGrid: createPulseGridTheme(),
        spectrumBloom: createSpectrumBloomTheme()
    };
}

// Key bindings per theme, for the on-screen help overlay. Kept separate
// from the theme instances so the UI can render the list without having
// to construct every theme up front. Themes with no live keys are
// simply absent from this map.
export const themeKeyHelp: Partial<Record<ThemeId, Array<[string, string]>>> = {
    sunburst: createSunburstTheme().keyHelp,
    starcore: createStarcoreTheme().keyHelp
};
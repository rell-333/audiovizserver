import { createSunburstPixiTheme, SUNBURST_LABEL } from './sunburst';
import { createDatamoshTheme, DATAMOSH_LABEL } from './datamosh';
import { createGooTheme, GOO_LABEL } from './goo';
import { createLaserTheme, LASER_LABEL } from './laser';
import type { PixiTheme } from './types';

// Themes rendered natively through PixiJS (GPU). The Canvas 2D themes in
// /themes still work and are listed alongside these - see themes/index.ts
// and the renderer switch in app/page.tsx.
export const pixiThemeIds = ['sunburstGpu', 'datamosh', 'goo', 'laser'] as const;
export type PixiThemeId = (typeof pixiThemeIds)[number];

export const pixiThemeLabels: Record<PixiThemeId, string> = {
    sunburstGpu: `${SUNBURST_LABEL} (GPU)`,
    datamosh: DATAMOSH_LABEL,
    goo: GOO_LABEL,
    laser: LASER_LABEL
};

export function createPixiTheme(id: PixiThemeId): PixiTheme {
    switch (id) {
        case 'sunburstGpu':
            return createSunburstPixiTheme();
        case 'datamosh':
            return createDatamoshTheme();
        case 'goo':
            return createGooTheme();
        case 'laser':
            return createLaserTheme();
    }
}

export const pixiThemeKeyHelp: Partial<Record<PixiThemeId, Array<[string, string]>>> = {
    sunburstGpu: createSunburstPixiTheme().keyHelp,
    datamosh: createDatamoshTheme().keyHelp,
    goo: createGooTheme().keyHelp,
    laser: createLaserTheme().keyHelp
};
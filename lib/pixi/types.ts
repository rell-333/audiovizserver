import type { Application, Container } from 'pixi.js';
import type { VisualizerData } from '../types';

// A theme rendered natively through PixiJS. Compared to the old Canvas
// 2D interface this splits setup from per-frame work: the scene graph is
// built once in setup() and then mutated in update(), rather than
// re-issuing every draw command each frame. That's the whole point of
// moving to a retained-mode GPU renderer.
export interface PixiTheme {
    label: string;

    // Build the scene graph. Anything added to `root` is rendered; anything
    // returned in `filters` is applied to the whole theme on the GPU.
    setup(ctx: PixiThemeContext): void;

    // Per-frame. Mutate the objects created in setup() - avoid allocating
    // or rebuilding the scene graph here.
    update(data: VisualizerData, dt: number, ctx: PixiThemeContext): void;

    // Free anything setup() created. Called when switching away.
    destroy(): void;

    onKey?(key: string): void;
    keyHelp?: Array<[string, string]>;
}

export interface PixiThemeContext {
    app: Application;
    root: Container;
    width: number;
    height: number;
}

export interface PixiThemeFactory {
    id: string;
    label: string;
    create(): PixiTheme;
}
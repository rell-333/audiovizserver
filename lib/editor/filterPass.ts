import { Container, Sprite, Texture, type Filter } from 'pixi.js';
import type { FrameContext } from './types';

// Every texture node does the same dance: put something in a container,
// hang filters on it, render it into this node's own target. This
// wraps that so an individual node file only has to say which filter it
// wants and how to drive it each frame.

export interface FilterPassOptions {
    // Called once, when the node is created.
    create(): Filter[];
    // Called every frame to push params into the filters.
    update(filters: Filter[], args: { params: Record<string, number | string | boolean>; ctx: FrameContext }): void;
}

export function createFilterPass(options: FilterPassOptions) {
    let container: Container | null = null;
    let sprite: Sprite | null = null;
    let filters: Filter[] | null = null;

    return {
        render(
            input: Texture | null,
            args: { params: Record<string, number | string | boolean>; ctx: FrameContext },
            opts: { generator?: boolean } = {}
        ): Texture | null {
            const { ctx } = args;

            // A generator has no input; it paints over a blank full-frame
            // sprite. An effect with nothing plugged in has nothing to do, so
            // it passes null through rather than rendering an empty pass.
            if (!opts.generator && !input) return null;

            if (!container) {
                container = new Container();
                sprite = new Sprite(opts.generator ? Texture.WHITE : Texture.EMPTY);
                container.addChild(sprite);
                filters = options.create();
                container.filters = filters;
            }

            if (sprite) {
                if (!opts.generator && input) sprite.texture = input;
                sprite.width = ctx.width;
                sprite.height = ctx.height;
            }

            if (filters) options.update(filters, args);

            const target = ctx.acquireTarget();
            ctx.app.renderer.render({ container, target, clear: true });
            return target;
        },

        dispose() {
            if (container) container.filters = [];
            sprite?.destroy();
            container?.destroy();
            container = null;
            sprite = null;
            filters = null;
        }
    };
}

export function num(params: Record<string, number | string | boolean>, id: string, fallback = 0): number {
    const v = params[id];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function str(params: Record<string, number | string | boolean>, id: string, fallback = ''): string {
    const v = params[id];
    return typeof v === 'string' ? v : fallback;
}

export function bool(params: Record<string, number | string | boolean>, id: string, fallback = false): boolean {
    const v = params[id];
    return typeof v === 'boolean' ? v : fallback;
}
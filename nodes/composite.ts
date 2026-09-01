import { defineNode } from '@/lib/editor/defineNode';
import { Container, Sprite, Texture } from 'pixi.js';
import { num, str } from '@/lib/editor/filterPass';

const BLEND_MODES = ['normal', 'add', 'multiply', 'screen', 'overlay', 'difference'] as const;

// A layer stack, same idea as Blend but for more than two sources at once:
// route several generators/effects in and mix them with independent
// blend modes and opacities, bottom to top. Any layer left unplugged is
// just skipped rather than treated as black.
export default defineNode({
    type: 'composite',
    label: 'Composite',
    category: 'composite',
    description: 'Stacks up to 4 layers with independent blend mode and opacity, bottom to top.',
    inputs: [
        { id: 'layer1', label: 'Layer 1 (bottom)', kind: 'texture' },
        { id: 'layer2', label: 'Layer 2', kind: 'texture' },
        { id: 'layer3', label: 'Layer 3', kind: 'texture' },
        { id: 'layer4', label: 'Layer 4 (top)', kind: 'texture' }
    ],
    outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
    params: [
        { id: 'mode2', label: 'Layer 2 Mode', kind: 'enum', options: [...BLEND_MODES], default: 'normal' },
        { id: 'opacity2', label: 'Layer 2 Opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
        { id: 'mode3', label: 'Layer 3 Mode', kind: 'enum', options: [...BLEND_MODES], default: 'normal' },
        { id: 'opacity3', label: 'Layer 3 Opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
        { id: 'mode4', label: 'Layer 4 Mode', kind: 'enum', options: [...BLEND_MODES], default: 'normal' },
        { id: 'opacity4', label: 'Layer 4 Opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
        { id: 'opacity1', label: 'Layer 1 Opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 }
    ],
    createRuntime() {
        let container: Container | null = null;
        let sprites: Sprite[] | null = null;

        const layerKeys = ['layer1', 'layer2', 'layer3', 'layer4'] as const;

        return {
            renderTexture({ textures, params, ctx }) {
                const layerTextures = layerKeys.map((k) => textures[k] ?? null);
                if (layerTextures.every((t) => !t)) return null;

                if (!container) {
                    container = new Container();
                    sprites = layerKeys.map(() => new Sprite(Texture.EMPTY));
                    for (const s of sprites) container.addChild(s);
                }

                layerTextures.forEach((tex, i) => {
                    const s = sprites![i];
                    s.texture = tex ?? Texture.EMPTY;
                    s.visible = !!tex;
                    s.width = ctx.width;
                    s.height = ctx.height;

                    if (i === 0) {
                        // Bottom layer composites normally - there's nothing under it
                        // for a blend mode to interact with, only its own opacity.
                        s.blendMode = 'normal';
                        s.alpha = num(params, 'opacity1', 1);
                    } else {
                        const n = i + 1;
                        s.blendMode = str(params, `mode${n}`, 'normal') as never;
                        s.alpha = num(params, `opacity${n}`, 1);
                    }
                });

                const target = ctx.acquireTarget();
                ctx.app.renderer.render({ container, target, clear: true });
                return target;
            },
            dispose() {
                sprites?.forEach((s) => s.destroy());
                container?.destroy();
                container = null;
                sprites = null;
            }
        };
    }
});
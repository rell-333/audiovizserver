import { defineNode } from '@/lib/editor/defineNode';
import { num } from '@/lib/editor/filterPass';
import { Container, Sprite, Texture } from 'pixi.js';
import { LumaAlphaFilter } from '@/lib/pixi/lumaAlphaFilter';

export default defineNode({
  type: 'mask',
  label: 'Mask',
  category: 'composite',
  description: 'Cuts out Image using Mask. Works with a real alpha mask or a plain grayscale generator.',
  inputs: [
    { id: 'image', label: 'Image', kind: 'texture' },
    { id: 'mask', label: 'Mask', kind: 'texture' }
  ],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'lumaMix', label: 'Use Luma', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'invert', label: 'Invert', kind: 'boolean', default: false },
    { id: 'threshold', label: 'Threshold', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'softness', label: 'Softness', kind: 'number', min: 0.02, max: 1, step: 0.01, default: 1 }
  ],
  createRuntime() {
    let container: Container | null = null;
    let sImage: Sprite | null = null;
    let sMask: Sprite | null = null;
    let maskFilter: LumaAlphaFilter | null = null;

    return {
      renderTexture({ textures, params, ctx }) {
        const image = textures.image ?? null;
        const mask = textures.mask ?? null;
        if (!image) return null;
        if (!mask) return image;

        if (!container) {
          container = new Container();
          sImage = new Sprite(Texture.EMPTY);
          sMask = new Sprite(Texture.EMPTY);
          maskFilter = new LumaAlphaFilter();
          sMask.filters = [maskFilter as never];
          container.addChild(sImage, sMask);
        }

        maskFilter!.lumaMix = num(params, 'lumaMix', 1);
        maskFilter!.invert = Boolean(params.invert);
        maskFilter!.threshold = num(params, 'threshold', 0.5);
        maskFilter!.softness = num(params, 'softness', 1);

        sImage!.texture = image;
        sImage!.width = ctx.width;
        sImage!.height = ctx.height;
        sImage!.mask = sMask;

        sMask!.texture = mask;
        sMask!.width = ctx.width;
        sMask!.height = ctx.height;

        const target = ctx.acquireTarget();
        ctx.app.renderer.render({ container, target, clear: true });
        return target;
      },
      dispose() {
        if (sImage) sImage.mask = null;
        sImage?.destroy();
        sMask?.destroy();
        container?.destroy();
        container = null;
        sImage = null;
        sMask = null;
        maskFilter = null;
      }
    };
  }
});

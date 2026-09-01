import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { ColorMatrixFilter, type Filter } from 'pixi.js';

export default defineNode({
  type: 'colorAdjust',
  label: 'Colour Adjust',
  category: 'effect',
  description: 'Hue rotate, saturate, contrast, and invert.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'hue', label: 'Hue', kind: 'number', min: 0, max: 360, step: 1, default: 0 },
    { id: 'saturation', label: 'Saturation', kind: 'number', min: -1, max: 3, step: 0.01, default: 0 },
    { id: 'contrast', label: 'Contrast', kind: 'number', min: -1, max: 2, step: 0.01, default: 0 },
    { id: 'brightness', label: 'Brightness', kind: 'number', min: 0, max: 3, step: 0.01, default: 1 },
    { id: 'invert', label: 'Invert', kind: 'number', min: 0, max: 1, step: 1, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new ColorMatrixFilter() as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as ColorMatrixFilter;
        f.reset();
        const hue = num(params, 'hue', 0);
        if (hue !== 0) f.hue(hue, true);
        const sat = num(params, 'saturation', 0);
        if (sat !== 0) f.saturate(sat, true);
        const con = num(params, 'contrast', 0);
        if (con !== 0) f.contrast(con, true);
        const bri = num(params, 'brightness', 1);
        if (bri !== 1) f.brightness(bri, true);
        if (num(params, 'invert', 0) > 0.5) f.negative(true);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

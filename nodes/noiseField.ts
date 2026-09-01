import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { NoiseFieldFilter } from '@/lib/pixi/noiseFieldFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'noiseField',
  label: 'Noise Field',
  category: 'generator',
  description: 'Drifting fractal (fbm) noise, colorized between two colours.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Scale', kind: 'number', min: 0.5, max: 20, step: 0.1, default: 3 },
    { id: 'speed', label: 'Speed', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.05 },
    { id: 'octaves', label: 'Octaves', kind: 'number', min: 1, max: 6, step: 1, default: 4 },
    { id: 'contrast', label: 'Contrast', kind: 'number', min: 0.2, max: 3, step: 0.01, default: 1 },
    { id: 'colorAR', label: 'Color A R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 },
    { id: 'colorAG', label: 'Color A G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 },
    { id: 'colorAB', label: 'Color A B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'colorBR', label: 'Color B R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBG', label: 'Color B G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: 'colorBB', label: 'Color B B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new NoiseFieldFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as NoiseFieldFilter;
        f.scale = num(params, 'scale', 3);
        f.speed = num(params, 'speed', 0.05);
        f.octaves = num(params, 'octaves', 4);
        f.contrast = num(params, 'contrast', 1);
        f.setColorA(num(params, 'colorAR', 0.05), num(params, 'colorAG', 0.05), num(params, 'colorAB', 0.1));
        f.setColorB(num(params, 'colorBR', 1), num(params, 'colorBG', 0.6), num(params, 'colorBB', 0.1));
        f.advance(ctx.dt);
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

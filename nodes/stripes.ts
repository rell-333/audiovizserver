import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { StripesFilter } from '@/lib/pixi/stripesFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'stripes',
  label: 'Stripes',
  category: 'generator',
  description: 'Editable scrolling stripes at any angle, with soft or hard edges.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Scale', kind: 'number', min: 0.5, max: 40, step: 0.5, default: 6 },
    { id: 'angle', label: 'Angle', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
    { id: 'softness', label: 'Softness', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.05 },
    { id: 'scrollSpeed', label: 'Scroll Speed', kind: 'number', min: -2, max: 2, step: 0.01, default: 0 },
    { id: 'colorAR', label: 'Color A R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Color A G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAB', label: 'Color A B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBR', label: 'Color B R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBG', label: 'Color B G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Color B B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new StripesFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as StripesFilter;
        f.scale = num(params, 'scale', 6);
        f.angle = num(params, 'angle', 0);
        f.softness = num(params, 'softness', 0.05);
        f.scrollSpeed = num(params, 'scrollSpeed', 0);
        f.setColorA(num(params, 'colorAR', 1), num(params, 'colorAG', 1), num(params, 'colorAB', 1));
        f.setColorB(num(params, 'colorBR', 0), num(params, 'colorBG', 0), num(params, 'colorBB', 0));
        f.advance(ctx.dt);
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

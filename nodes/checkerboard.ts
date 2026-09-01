import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { CheckerboardFilter } from '@/lib/pixi/checkerboardFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'checkerboard',
  label: 'Checkerboard',
  category: 'generator',
  description: 'Editable two-colour checker grid, any scale or rotation.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Scale', kind: 'number', min: 1, max: 60, step: 1, default: 8 },
    { id: 'rotation', label: 'Rotation', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
    { id: 'colorAR', label: 'Color A R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Color A G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAB', label: 'Color A B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBR', label: 'Color B R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBG', label: 'Color B G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Color B B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new CheckerboardFilter() as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as CheckerboardFilter;
        f.scale = num(params, 'scale', 8);
        f.rotation = num(params, 'rotation', 0);
        f.setColorA(num(params, 'colorAR', 1), num(params, 'colorAG', 1), num(params, 'colorAB', 1));
        f.setColorB(num(params, 'colorBR', 0), num(params, 'colorBG', 0), num(params, 'colorBB', 0));
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

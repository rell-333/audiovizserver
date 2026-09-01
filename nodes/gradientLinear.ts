import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { GradientLinearFilter } from '@/lib/pixi/gradientLinearFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'gradientLinear',
  label: 'Linear Gradient',
  category: 'generator',
  description: 'Two-colour gradient at any angle. Push Hardness for a hard split instead of a blend.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'angle', label: 'Angle', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
    { id: 'hardness', label: 'Hardness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorAR', label: 'Color A R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 },
    { id: 'colorAG', label: 'Color A G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorAB', label: 'Color A B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2 },
    { id: 'colorBR', label: 'Color B R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBG', label: 'Color B G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { id: 'colorBB', label: 'Color B B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.7 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new GradientLinearFilter() as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as GradientLinearFilter;
        f.angle = num(params, 'angle', 0);
        f.hardness = num(params, 'hardness', 0);
        f.setColorA(num(params, 'colorAR', 0.05), num(params, 'colorAG', 0), num(params, 'colorAB', 0.2));
        f.setColorB(num(params, 'colorBR', 1), num(params, 'colorBG', 0.4), num(params, 'colorBB', 0.7));
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

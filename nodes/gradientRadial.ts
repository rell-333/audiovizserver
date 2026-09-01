import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { GradientRadialFilter } from '@/lib/pixi/gradientRadialFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'gradientRadial',
  label: 'Radial Gradient',
  category: 'generator',
  description: 'Two-colour gradient radiating from a centre point.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'radius', label: 'Radius', kind: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.6 },
    { id: 'hardness', label: 'Hardness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'colorAR', label: 'Color A R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Color A G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.9 },
    { id: 'colorAB', label: 'Color A B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'colorBR', label: 'Color B R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 },
    { id: 'colorBG', label: 'Color B G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Color B B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.15 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new GradientRadialFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as GradientRadialFilter;
        f.radius = num(params, 'radius', 0.6);
        f.hardness = num(params, 'hardness', 0);
        f.setCentre(num(params, 'centreX', 0.5), num(params, 'centreY', 0.5));
        f.setColorA(num(params, 'colorAR', 1), num(params, 'colorAG', 0.9), num(params, 'colorAB', 0.3));
        f.setColorB(num(params, 'colorBR', 0.05), num(params, 'colorBG', 0), num(params, 'colorBB', 0.15));
        void ctx;
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

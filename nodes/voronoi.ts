import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { VoronoiFilter } from '@/lib/pixi/voronoiFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'voronoi',
  label: 'Voronoi Cells',
  category: 'generator',
  description: 'Organic cellular pattern with wobbling seed points and coloured edges.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Scale', kind: 'number', min: 1, max: 24, step: 0.5, default: 6 },
    { id: 'speed', label: 'Wobble Speed', kind: 'number', min: -2, max: 2, step: 0.01, default: 0.2 },
    { id: 'edgeThickness', label: 'Edge Thickness', kind: 'number', min: 0, max: 0.4, step: 0.01, default: 0.08 },
    { id: 'colorBySite', label: 'Colour By Cell', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAR', label: 'Color A R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'colorAG', label: 'Color A G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: 'colorAB', label: 'Color A B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBR', label: 'Color B R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBG', label: 'Color B G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'colorBB', label: 'Color B B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: 'edgeR', label: 'Edge R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'edgeG', label: 'Edge G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'edgeB', label: 'Edge B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new VoronoiFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as VoronoiFilter;
        f.scale = num(params, 'scale', 6);
        f.speed = num(params, 'speed', 0.2);
        f.edgeThickness = num(params, 'edgeThickness', 0.08);
        f.colorBySite = num(params, 'colorBySite', 1);
        f.setColorA(num(params, 'colorAR', 0.1), num(params, 'colorAG', 0.6), num(params, 'colorAB', 1));
        f.setColorB(num(params, 'colorBR', 1), num(params, 'colorBG', 0.1), num(params, 'colorBB', 0.6));
        f.setColorEdge(num(params, 'edgeR', 0), num(params, 'edgeG', 0), num(params, 'edgeB', 0));
        f.advance(ctx.dt);
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

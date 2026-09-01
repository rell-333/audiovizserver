import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { GridFilter } from '@/lib/pixi/gridFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'grid',
  label: 'Grid Lines',
  category: 'generator',
  description: 'Technical line grid, any spacing/thickness/rotation.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'spacing', label: 'Spacing', kind: 'number', min: 1, max: 60, step: 1, default: 10 },
    { id: 'thickness', label: 'Thickness', kind: 'number', min: 0.005, max: 0.2, step: 0.005, default: 0.04 },
    { id: 'rotation', label: 'Rotation', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
    { id: 'lineR', label: 'Line R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'lineG', label: 'Line G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'lineB', label: 'Line B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'bgR', label: 'Bg R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'bgG', label: 'Bg G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'bgB', label: 'Bg B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new GridFilter() as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as GridFilter;
        f.spacing = num(params, 'spacing', 10);
        f.thickness = num(params, 'thickness', 0.04);
        f.rotation = num(params, 'rotation', 0);
        f.setColorLine(num(params, 'lineR', 1), num(params, 'lineG', 1), num(params, 'lineB', 1));
        f.setColorBg(num(params, 'bgR', 0), num(params, 'bgG', 0), num(params, 'bgB', 0));
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { RGBSplitFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'rgbSplit',
  label: 'RGB Split',
  category: 'effect',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'amount', label: 'Amount', kind: 'number', min: 0, max: 40, step: 0.1, default: 6 },
    { id: 'angle', label: 'Angle', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new RGBSplitFilter() as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as RGBSplitFilter;
        const a = num(params, 'amount', 6);
        const ang = num(params, 'angle', 0);
        const dx = Math.cos(ang) * a;
        const dy = Math.sin(ang) * a;
        f.red = { x: -dx, y: -dy } as never;
        f.green = { x: dy * 0.5, y: -dx * 0.5 } as never;
        f.blue = { x: dx, y: dy } as never;
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

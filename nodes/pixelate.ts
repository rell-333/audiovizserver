import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { PixelateFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'pixelate',
  label: 'Pixelate',
  category: 'effect',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [{ id: 'size', label: 'Block Size', kind: 'number', min: 1, max: 80, step: 1, default: 8 }],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new PixelateFilter(8) as unknown as Filter],
      update(filters, { params }) {
        (filters[0] as unknown as PixelateFilter).size = Math.max(1, num(params, 'size', 8));
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

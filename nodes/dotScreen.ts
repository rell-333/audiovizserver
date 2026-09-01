import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { DotFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'dotScreen',
  label: 'Dot Screen',
  category: 'effect',
  description: 'Halftone-style dot pattern, like a newspaper print.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Dot Scale', kind: 'number', min: 0.2, max: 6, step: 0.05, default: 1 },
    { id: 'grayscale', label: 'Grayscale', kind: 'boolean', default: true }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new DotFilter(1, true) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as DotFilter;
        f.scale = num(params, 'scale', 1);
        f.grayscale = params.grayscale === undefined ? true : Boolean(params.grayscale);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

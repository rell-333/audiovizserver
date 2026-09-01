import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { EmbossFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'emboss',
  label: 'Emboss',
  category: 'effect',
  description: 'Relief-style shading along edges, like light raking across a stamped surface.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [{ id: 'strength', label: 'Strength', kind: 'number', min: 0, max: 20, step: 0.1, default: 5 }],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new EmbossFilter(5) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as EmbossFilter;
        f.strength = num(params, 'strength', 5);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

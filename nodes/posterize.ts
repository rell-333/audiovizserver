import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { PosterizeFilter } from '@/lib/pixi/posterizeFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'posterize',
  label: 'Posterize',
  category: 'effect',
  description: 'Quantizes colour into flat bands. Lower levels for a screenprint look.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'levels', label: 'Levels', kind: 'number', min: 2, max: 32, step: 1, default: 6 },
    { id: 'gamma', label: 'Gamma', kind: 'number', min: 0.2, max: 3, step: 0.01, default: 1 },
    { id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new PosterizeFilter({ levels: 6, mix: 1, gamma: 1 }) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as PosterizeFilter;
        f.levels = num(params, 'levels', 6);
        f.gamma = num(params, 'gamma', 1);
        f.mix = num(params, 'mix', 1);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

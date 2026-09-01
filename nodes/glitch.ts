import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { GlitchFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'glitch',
  label: 'Glitch',
  category: 'effect',
  description: 'Horizontal slice displacement.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'offset', label: 'Offset', kind: 'number', min: 0, max: 200, step: 1, default: 40 },
    { id: 'slices', label: 'Slices', kind: 'number', min: 2, max: 40, step: 1, default: 8 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new GlitchFilter({ slices: 8, offset: 40 }) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as GlitchFilter;
        f.offset = num(params, 'offset', 40);
        f.slices = Math.max(2, Math.round(num(params, 'slices', 8)));
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

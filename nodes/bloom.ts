import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { AdvancedBloomFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'bloom',
  label: 'Bloom',
  category: 'effect',
  description: 'Glow on the brightest areas. Keep threshold high or it washes out.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'amount', label: 'Amount', kind: 'number', min: 0, max: 3, step: 0.01, default: 0.8 },
    { id: 'threshold', label: 'Threshold', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.62 },
    { id: 'blur', label: 'Blur', kind: 'number', min: 1, max: 20, step: 0.5, default: 8 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new AdvancedBloomFilter({ threshold: 0.62, bloomScale: 0.8, blur: 8, quality: 4 }) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as AdvancedBloomFilter;
        f.bloomScale = num(params, 'amount', 0.8);
        f.threshold = num(params, 'threshold', 0.62);
        f.blur = num(params, 'blur', 8);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

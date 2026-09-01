import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { EdgeDetectFilter } from '@/lib/pixi/edgeDetectFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'edgeDetect',
  label: 'Edge Detect',
  category: 'effect',
  description: 'Sobel edge detection. Low threshold picks up faint detail; high threshold isolates hard edges.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'threshold', label: 'Threshold', kind: 'number', min: 0, max: 1.5, step: 0.01, default: 0.3 },
    { id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'invert', label: 'Invert', kind: 'boolean', default: false }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new EdgeDetectFilter({ threshold: 0.3, mix: 1 }) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as EdgeDetectFilter;
        f.threshold = num(params, 'threshold', 0.3);
        f.mix = num(params, 'mix', 1);
        f.invert = Boolean(params.invert);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { KaleidoFilter } from '@/lib/pixi/kaleidoFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'kaleido',
  label: 'Kaleidoscope',
  category: 'effect',
  description: 'Polar mirror fold. Higher segment counts show fewer colours at once.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'segments', label: 'Segments', kind: 'number', min: 2, max: 24, step: 1, default: 6 },
    { id: 'rotation', label: 'Rotation', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
    { id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new KaleidoFilter({ segments: 6, mix: 1 }) as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as KaleidoFilter;
        f.segments = Math.max(2, Math.round(num(params, 'segments', 6)));
        f.rotation = num(params, 'rotation', 0);
        f.mix = num(params, 'mix', 1);
        f.setCentre(num(params, 'centreX', 0.5) * ctx.width, num(params, 'centreY', 0.5) * ctx.height);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

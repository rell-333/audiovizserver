import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { TwistFilter, BulgePinchFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

// Twist + bulge together: a real per-pixel spatial warp, which is the
// thing that's genuinely impossible without a GPU.
export default defineNode({
  type: 'warp',
  label: 'Warp',
  category: 'effect',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'twist', label: 'Twist', kind: 'number', min: -8, max: 8, step: 0.01, default: 0 },
    { id: 'bulge', label: 'Bulge', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
    { id: 'radius', label: 'Radius', kind: 'number', min: 0.1, max: 1.5, step: 0.01, default: 0.7 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [
        new TwistFilter({ radius: 400, angle: 0, offset: { x: 0, y: 0 } }) as unknown as Filter,
        new BulgePinchFilter({ center: { x: 0.5, y: 0.5 }, radius: 400, strength: 0 }) as unknown as Filter
      ],
      update(filters, { params, ctx }) {
        const t = filters[0] as unknown as TwistFilter;
        const b = filters[1] as unknown as BulgePinchFilter;
        const r = num(params, 'radius', 0.7) * Math.min(ctx.width, ctx.height);
        t.angle = num(params, 'twist', 0);
        t.radius = r;
        t.offset = { x: ctx.width / 2, y: ctx.height / 2 } as never;
        b.strength = num(params, 'bulge', 0);
        b.radius = r;
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { VignetteFilter } from '@/lib/pixi/vignetteFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'vignette',
  label: 'Vignette',
  category: 'effect',
  description: 'Darkens (or tints) the edges of the frame around a centre point.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'radius', label: 'Radius', kind: 'number', min: 0, max: 1.2, step: 0.01, default: 0.75 },
    { id: 'softness', label: 'Softness', kind: 'number', min: 0.01, max: 1.2, step: 0.01, default: 0.4 },
    { id: 'strength', label: 'Strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new VignetteFilter({ radius: 0.75, softness: 0.4, strength: 1 }) as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as VignetteFilter;
        f.radius = num(params, 'radius', 0.75);
        f.softness = num(params, 'softness', 0.4);
        f.strength = num(params, 'strength', 1);
        f.setCentre(num(params, 'centreX', 0.5) * ctx.width, num(params, 'centreY', 0.5) * ctx.height);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

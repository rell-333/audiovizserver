import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { ZoomBlurFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'zoomBlur',
  label: 'Zoom Blur',
  category: 'effect',
  description: 'Radial speed blur from a point.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'strength', label: 'Strength', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'inner', label: 'Inner Radius', kind: 'number', min: 0, max: 400, step: 1, default: 60 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new ZoomBlurFilter({ strength: 0.3, center: { x: 0, y: 0 }, innerRadius: 60 }) as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as ZoomBlurFilter;
        f.strength = num(params, 'strength', 0.3);
        f.innerRadius = num(params, 'inner', 60);
        f.center = {
          x: num(params, 'centreX', 0.5) * ctx.width,
          y: num(params, 'centreY', 0.5) * ctx.height
        } as never;
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

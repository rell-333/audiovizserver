import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { PlasmaFilter } from '@/lib/pixi/plasmaFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'plasma',
  label: 'Plasma',
  category: 'generator',
  description: 'Classic sine-wave plasma, colour-cycled and bass-reactive.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Scale', kind: 'number', min: 0.5, max: 12, step: 0.1, default: 3 },
    { id: 'speed', label: 'Speed', kind: 'number', min: -3, max: 3, step: 0.01, default: 0.6 },
    { id: 'colorCycle', label: 'Colour Cycle', kind: 'number', min: 0, max: 5, step: 0.01, default: 1 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new PlasmaFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as PlasmaFilter;
        f.scale = num(params, 'scale', 3);
        f.speed = num(params, 'speed', 0.6);
        f.colorCycle = num(params, 'colorCycle', 1);
        f.advance(ctx.dt);
        f.setAudio(ctx.data.bassNorm);
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

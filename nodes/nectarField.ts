import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { NectarFilter } from '@/lib/pixi/nectarFilter';
import { beatPulse } from '@/lib/beatPulse';
import type { Filter } from 'pixi.js';

// The domain-warped liquid field, as a generator node.
export default defineNode({
  type: 'nectarField',
  label: 'Nectar Field',
  category: 'generator',
  description: 'Full-frame liquid iridescent colour field.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'warp', label: 'Warp', kind: 'number', min: 0, max: 8, step: 0.05, default: 2.5 },
    { id: 'scale', label: 'Scale', kind: 'number', min: 0.3, max: 8, step: 0.05, default: 2 },
    { id: 'flow', label: 'Flow Speed', kind: 'number', min: 0, max: 4, step: 0.01, default: 1 },
    { id: 'colorShift', label: 'Colour Shift', kind: 'number', min: 0, max: 10, step: 0.01, default: 0 },
    { id: 'saturation', label: 'Saturation', kind: 'number', min: 0.5, max: 2.5, step: 0.01, default: 1.55 },
    { id: 'specular', label: 'Specular', kind: 'number', min: 0, max: 3, step: 0.01, default: 1 },
    { id: 'bandSharpness', label: 'Band Edge', kind: 'number', min: 0.02, max: 0.48, step: 0.01, default: 0.15 },
    { id: 'iridescence', label: 'Iridescence', kind: 'number', min: 0, max: 3, step: 0.01, default: 1 }
  ],
  createRuntime() {
    let clock = 0;
    const pass = createFilterPass({
      create: () => [new NectarFilter({ warp: 2.5, scale: 2 }) as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as NectarFilter;
        clock += ctx.dt * num(params, 'flow', 1);
        f.time = clock;
        f.warp = num(params, 'warp', 2.5);
        f.scale = num(params, 'scale', 2);
        f.colorShift = num(params, 'colorShift', 0);
        f.saturation = num(params, 'saturation', 1.55);
        f.specular = num(params, 'specular', 1);
        f.bandSharpness = num(params, 'bandSharpness', 0.15);
        f.iridescence = num(params, 'iridescence', 1);
        const d = ctx.data;
        f.setAudio(d.bassNorm, d.midNorm, d.trebleNorm, beatPulse(d.beatPhase, 4));
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

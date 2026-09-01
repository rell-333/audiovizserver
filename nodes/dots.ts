import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { DotsFilter } from '@/lib/pixi/dotsFilter';
import { beatPulse } from '@/lib/beatPulse';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'dots',
  label: 'Dots',
  category: 'generator',
  description: 'Regular (or jittered) grid of dots, pulsing on the beat.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'spacing', label: 'Spacing', kind: 'number', min: 2, max: 60, step: 1, default: 12 },
    { id: 'radius', label: 'Radius', kind: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.25 },
    { id: 'jitter', label: 'Jitter', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'beatPulse', label: 'Beat Pulse', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.3 },
    { id: 'colorAR', label: 'Dot R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Dot G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAB', label: 'Dot B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBR', label: 'Bg R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBG', label: 'Bg G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Bg B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new DotsFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as DotsFilter;
        f.spacing = num(params, 'spacing', 12);
        f.radius = num(params, 'radius', 0.25);
        f.jitter = num(params, 'jitter', 0);
        f.beatPulseAmount = num(params, 'beatPulse', 0.3);
        f.setColorA(num(params, 'colorAR', 1), num(params, 'colorAG', 1), num(params, 'colorAB', 1));
        f.setColorB(num(params, 'colorBR', 0), num(params, 'colorBG', 0), num(params, 'colorBB', 0));
        f.advance(ctx.dt);
        f.setAudio(beatPulse(ctx.data.beatPhase, 4));
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

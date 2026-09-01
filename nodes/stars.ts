import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { StarsFilter } from '@/lib/pixi/starsFilter';
import { beatPulse } from '@/lib/beatPulse';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'stars',
  label: 'Stars',
  category: 'generator',
  description: 'Procedural drifting starfield with twinkle and beat-reactive brightness.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Density Grid', kind: 'number', min: 4, max: 60, step: 1, default: 20 },
    { id: 'density', label: 'Star Chance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.15 },
    { id: 'size', label: 'Size', kind: 'number', min: 0.01, max: 0.3, step: 0.01, default: 0.08 },
    { id: 'speed', label: 'Drift Speed', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.05 },
    { id: 'twinkle', label: 'Twinkle', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: 'colorAR', label: 'Star R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Star G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAB', label: 'Star B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBR', label: 'Bg R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBG', label: 'Bg G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Bg B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new StarsFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as StarsFilter;
        f.scale = num(params, 'scale', 20);
        f.density = num(params, 'density', 0.15);
        f.size = num(params, 'size', 0.08);
        f.speed = num(params, 'speed', 0.05);
        f.twinkle = num(params, 'twinkle', 0.6);
        f.setColorA(num(params, 'colorAR', 1), num(params, 'colorAG', 1), num(params, 'colorAB', 1));
        f.setColorB(num(params, 'colorBR', 0), num(params, 'colorBG', 0), num(params, 'colorBB', 0.05));
        f.advance(ctx.dt, 1);
        const d = ctx.data;
        f.setAudio(d.bassNorm, beatPulse(d.beatPhase, 4));
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

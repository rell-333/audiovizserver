import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { RingsFilter } from '@/lib/pixi/ringsFilter';
import { beatPulse } from '@/lib/beatPulse';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'rings',
  label: 'Rings',
  category: 'generator',
  description: 'Concentric rings expanding from a centre point, kicking outward on the beat.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'spacing', label: 'Spacing', kind: 'number', min: 1, max: 30, step: 0.5, default: 8 },
    { id: 'speed', label: 'Speed', kind: 'number', min: -1, max: 1, step: 0.01, default: 0.1 },
    { id: 'thickness', label: 'Thickness', kind: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.15 },
    { id: 'beatKick', label: 'Beat Kick', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.2 },
    { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'colorAR', label: 'Ring R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Ring G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAB', label: 'Ring B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorBR', label: 'Bg R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBG', label: 'Bg G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Bg B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new RingsFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as RingsFilter;
        f.spacing = num(params, 'spacing', 8);
        f.speed = num(params, 'speed', 0.1);
        f.thickness = num(params, 'thickness', 0.15);
        f.beatKick = num(params, 'beatKick', 0.2);
        f.setCentre(num(params, 'centreX', 0.5), num(params, 'centreY', 0.5));
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

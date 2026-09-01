import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { RaysFilter } from '@/lib/pixi/raysFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'rays',
  label: 'Light Rays',
  category: 'generator',
  description: 'Rotating radial rays from a centre point, brightened by treble.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'rayCount', label: 'Ray Count', kind: 'number', min: 2, max: 60, step: 1, default: 12 },
    { id: 'speed', label: 'Rotation Speed', kind: 'number', min: -2, max: 2, step: 0.01, default: 0.15 },
    { id: 'sharpness', label: 'Sharpness', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: 'falloff', label: 'Falloff', kind: 'number', min: 0.1, max: 4, step: 0.05, default: 1.2 },
    { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'colorAR', label: 'Ray R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'colorAG', label: 'Ray G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.9 },
    { id: 'colorAB', label: 'Ray B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'colorBR', label: 'Bg R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBG', label: 'Bg G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'colorBB', label: 'Bg B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new RaysFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as RaysFilter;
        f.rayCount = num(params, 'rayCount', 12);
        f.speed = num(params, 'speed', 0.15);
        f.sharpness = num(params, 'sharpness', 0.6);
        f.falloff = num(params, 'falloff', 1.2);
        f.setCentre(num(params, 'centreX', 0.5), num(params, 'centreY', 0.5));
        f.setColorA(num(params, 'colorAR', 1), num(params, 'colorAG', 0.9), num(params, 'colorAB', 0.5));
        f.setColorB(num(params, 'colorBR', 0), num(params, 'colorBG', 0), num(params, 'colorBB', 0));
        f.advance(ctx.dt);
        f.setAudio(ctx.data.trebleNorm);
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

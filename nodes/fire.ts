import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { FireFilter } from '@/lib/pixi/fireFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'fire',
  label: 'Fire',
  category: 'generator',
  description: 'Turbulent rising flame, three-colour ramp, bass-reactive heat.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'scale', label: 'Scale', kind: 'number', min: 0.5, max: 10, step: 0.1, default: 3 },
    { id: 'speed', label: 'Speed', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.3 },
    { id: 'turbulence', label: 'Turbulence', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
    { id: 'bassBoost', label: 'Bass Boost', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.5 },
    { id: 'lowR', label: 'Low R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.05 },
    { id: 'lowG', label: 'Low G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'lowB', label: 'Low B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'midR', label: 'Mid R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'midG', label: 'Mid G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { id: 'midB', label: 'Mid B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'highR', label: 'High R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'highG', label: 'High G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.95 },
    { id: 'highB', label: 'High B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new FireFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as FireFilter;
        f.scale = num(params, 'scale', 3);
        f.speed = num(params, 'speed', 0.3);
        f.turbulence = num(params, 'turbulence', 0.6);
        f.bassBoost = num(params, 'bassBoost', 0.5);
        f.setColorLow(num(params, 'lowR', 0.05), num(params, 'lowG', 0), num(params, 'lowB', 0));
        f.setColorMid(num(params, 'midR', 1), num(params, 'midG', 0.4), num(params, 'midB', 0));
        f.setColorHigh(num(params, 'highR', 1), num(params, 'highG', 0.95), num(params, 'highB', 0.6));
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

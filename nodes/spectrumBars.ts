import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { SpectrumBarsFilter } from '@/lib/pixi/spectrumBarsFilter';
import type { Filter } from 'pixi.js';

// Interpolates across bass/mid/treble by bar position (the pipeline
// exposes three scalar bands, not a full FFT array) plus per-bar jitter
// for shimmer - a classic EQ-bars look rather than a literal spectrum.
export default defineNode({
  type: 'spectrumBars',
  label: 'Spectrum Bars',
  category: 'generator',
  description: 'Classic vertical EQ bars, interpolated across bass/mid/treble.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'barCount', label: 'Bar Count', kind: 'number', min: 4, max: 64, step: 1, default: 24 },
    { id: 'gap', label: 'Gap', kind: 'number', min: 0, max: 0.4, step: 0.01, default: 0.1 },
    { id: 'jitter', label: 'Shimmer', kind: 'number', min: 0, max: 0.3, step: 0.01, default: 0.05 },
    { id: 'lowR', label: 'Low R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'lowG', label: 'Low G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.8 },
    { id: 'lowB', label: 'Low B', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'highR', label: 'High R', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'highG', label: 'High G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'highB', label: 'High B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new SpectrumBarsFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as SpectrumBarsFilter;
        f.barCount = num(params, 'barCount', 24);
        f.gap = num(params, 'gap', 0.1);
        f.jitter = num(params, 'jitter', 0.05);
        f.setColorLow(num(params, 'lowR', 0.1), num(params, 'lowG', 0.8), num(params, 'lowB', 1));
        f.setColorHigh(num(params, 'highR', 1), num(params, 'highG', 0.1), num(params, 'highB', 0.6));
        f.advance(ctx.dt);
        const d = ctx.data;
        f.setAudio(d.bassNorm, d.midNorm, d.trebleNorm);
      }
    });
    return {
      renderTexture: (args) => pass.render(null, args, { generator: true }),
      dispose: () => pass.dispose()
    };
  }
});

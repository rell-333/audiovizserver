import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { WaveformFilter } from '@/lib/pixi/waveformFilter';
import type { Filter } from 'pixi.js';

// Runs off scalar bass/mid/treble levels rather than a raw sample buffer
// (see the filter file for why), so it's a band-driven wave shape rather
// than a true oscilloscope trace - still reads as a live waveform.
export default defineNode({
  type: 'waveform',
  label: 'Waveform',
  category: 'generator',
  description: 'Glowing audio-reactive wave line, driven by bass/mid/treble.',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'speed', label: 'Speed', kind: 'number', min: -3, max: 3, step: 0.01, default: 1 },
    { id: 'amplitude', label: 'Amplitude', kind: 'number', min: 0, max: 0.5, step: 0.01, default: 0.15 },
    { id: 'thickness', label: 'Thickness', kind: 'number', min: 0.002, max: 0.05, step: 0.001, default: 0.01 },
    { id: 'glow', label: 'Glow', kind: 'number', min: 1, max: 12, step: 0.1, default: 4 },
    { id: 'lineR', label: 'Line R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'lineG', label: 'Line G', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'lineB', label: 'Line B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.8 },
    { id: 'bgR', label: 'Bg R', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'bgG', label: 'Bg G', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'bgB', label: 'Bg B', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new WaveformFilter() as unknown as Filter],
      update(filters, { params, ctx }) {
        const f = filters[0] as unknown as WaveformFilter;
        f.speed = num(params, 'speed', 1);
        f.amplitude = num(params, 'amplitude', 0.15);
        f.thickness = num(params, 'thickness', 0.01);
        f.glow = num(params, 'glow', 4);
        f.setColorLine(num(params, 'lineR', 0.3), num(params, 'lineG', 1), num(params, 'lineB', 0.8));
        f.setColorBg(num(params, 'bgR', 0), num(params, 'bgG', 0), num(params, 'bgB', 0));
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

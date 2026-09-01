import { defineNode } from '@/lib/editor/defineNode';
import { num, str } from '@/lib/editor/filterPass';

// Free-running or tempo-locked oscillator. Tempo lock uses the live BPM
// so a rate of 1 is one cycle per beat, 0.25 is one per bar.
export default defineNode({
  type: 'lfo',
  label: 'LFO',
  category: 'source',
  description: 'Sine / triangle / square / random, optionally beat-synced.',
  outputs: [{ id: 'out', label: 'Out', kind: 'value' }],
  params: [
    { id: 'shape', label: 'Shape', kind: 'enum', options: ['sine', 'triangle', 'square', 'saw', 'random'], default: 'sine' },
    { id: 'rate', label: 'Rate', kind: 'number', min: 0.01, max: 8, step: 0.01, default: 0.5 },
    { id: 'depth', label: 'Depth', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'offset', label: 'Offset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
    { id: 'sync', label: 'Sync to BPM', kind: 'boolean', default: true }
  ],
  createRuntime() {
    let phase = 0;
    let lastRandom = 0;
    let lastStep = -1;
    return {
      evalValues({ params, ctx }) {
        const rate = num(params, 'rate', 0.5);
        const synced = params.sync === true;
        const hz = synced ? (ctx.data.bpm / 60) * rate : rate;
        phase = (phase + ctx.dt * hz) % 1;

        const shape = str(params, 'shape', 'sine');
        let v: number;
        switch (shape) {
          case 'triangle': v = 1 - Math.abs(phase * 2 - 1); break;
          case 'square': v = phase < 0.5 ? 1 : 0; break;
          case 'saw': v = phase; break;
          case 'random': {
            const step = Math.floor(phase * 4);
            if (step !== lastStep) { lastStep = step; lastRandom = Math.random(); }
            v = lastRandom;
            break;
          }
          default: v = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
        }
        return { out: v * num(params, 'depth', 1) + num(params, 'offset', 0) };
      }
    };
  }
});

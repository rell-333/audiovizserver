import { defineNode } from '@/lib/editor/defineNode';
import { num } from '@/lib/editor/filterPass';

// Attack/release smoothing, the same ballistics used throughout the
// themes. Raw band values are noisy; feeding them straight into geometry
// makes things shimmer, so most audio wires want one of these.
export default defineNode({
  type: 'smooth',
  label: 'Smooth',
  category: 'signal',
  inputs: [{ id: 'in', label: 'In', kind: 'value' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'value' }],
  params: [
    { id: 'attack', label: 'Attack', kind: 'number', min: 0.5, max: 30, step: 0.1, default: 12 },
    { id: 'release', label: 'Release', kind: 'number', min: 0.2, max: 30, step: 0.1, default: 3 }
  ],
  createRuntime() {
    let current = 0;
    return {
      evalValues({ values, params, ctx }) {
        const target = values.in ?? 0;
        const rate = target > current ? num(params, 'attack', 12) : num(params, 'release', 3);
        current += (target - current) * (1 - Math.exp(-rate * ctx.dt));
        return { out: current };
      }
    };
  }
});

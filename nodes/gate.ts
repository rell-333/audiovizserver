import { defineNode } from '@/lib/editor/defineNode';
import { num } from '@/lib/editor/filterPass';

// Threshold with a decaying trigger. Wire a beat into it for an envelope
// that fires on the hit and falls away.
export default defineNode({
  type: 'gate',
  label: 'Gate / Trigger',
  category: 'signal',
  inputs: [{ id: 'in', label: 'In', kind: 'value' }],
  outputs: [
    { id: 'gate', label: 'Gate', kind: 'value' },
    { id: 'env', label: 'Envelope', kind: 'value' }
  ],
  params: [
    { id: 'threshold', label: 'Threshold', kind: 'number', min: 0, max: 2, step: 0.01, default: 0.5 },
    { id: 'decay', label: 'Decay', kind: 'number', min: 0.2, max: 12, step: 0.1, default: 3 }
  ],
  createRuntime() {
    let env = 0;
    let wasOpen = false;
    return {
      evalValues({ values, params, ctx }) {
        const v = values.in ?? 0;
        const open = v >= num(params, 'threshold', 0.5);
        if (open && !wasOpen) env = 1;
        wasOpen = open;
        env = Math.max(0, env - num(params, 'decay', 3) * ctx.dt);
        return { gate: open ? 1 : 0, env };
      }
    };
  }
});

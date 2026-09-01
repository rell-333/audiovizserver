import { defineNode } from '@/lib/editor/defineNode';
import { num, bool } from '@/lib/editor/filterPass';

// Scales one range onto another. The workhorse for getting an audio
// band (0-1) into whatever range a parameter actually wants.
export default defineNode({
  type: 'remap',
  label: 'Remap',
  category: 'signal',
  inputs: [{ id: 'in', label: 'In', kind: 'value' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'value' }],
  params: [
    { id: 'inMin', label: 'In Min', kind: 'number', min: -4, max: 4, step: 0.01, default: 0 },
    { id: 'inMax', label: 'In Max', kind: 'number', min: -4, max: 4, step: 0.01, default: 1 },
    { id: 'outMin', label: 'Out Min', kind: 'number', min: -8, max: 8, step: 0.01, default: 0 },
    { id: 'outMax', label: 'Out Max', kind: 'number', min: -8, max: 8, step: 0.01, default: 1 },
    { id: 'clamp', label: 'Clamp', kind: 'boolean', default: true }
  ],
  createRuntime() {
    return {
      evalValues({ values, params }) {
        const v = values.in ?? 0;
        const iMin = num(params, 'inMin', 0);
        const iMax = num(params, 'inMax', 1);
        const oMin = num(params, 'outMin', 0);
        const oMax = num(params, 'outMax', 1);
        const span = iMax - iMin;
        let t = span === 0 ? 0 : (v - iMin) / span;
        if (bool(params, 'clamp', true)) t = Math.max(0, Math.min(1, t));
        return { out: oMin + t * (oMax - oMin) };
      }
    };
  }
});

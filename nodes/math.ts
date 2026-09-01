import { defineNode } from '@/lib/editor/defineNode';
import { num, str } from '@/lib/editor/filterPass';

export default defineNode({
  type: 'math',
  label: 'Math',
  category: 'signal',
  inputs: [
    { id: 'a', label: 'A', kind: 'value' },
    { id: 'b', label: 'B', kind: 'value' }
  ],
  outputs: [{ id: 'out', label: 'Out', kind: 'value' }],
  params: [
    { id: 'op', label: 'Operation', kind: 'enum', options: ['add', 'subtract', 'multiply', 'divide', 'min', 'max', 'power'], default: 'multiply' },
    { id: 'fallbackA', label: 'A (unwired)', kind: 'number', min: -4, max: 4, step: 0.01, default: 0 },
    { id: 'fallbackB', label: 'B (unwired)', kind: 'number', min: -4, max: 4, step: 0.01, default: 1 }
  ],
  createRuntime() {
    return {
      evalValues({ values, params }) {
        const a = values.a ?? num(params, 'fallbackA', 0);
        const b = values.b ?? num(params, 'fallbackB', 1);
        switch (str(params, 'op', 'multiply')) {
          case 'add': return { out: a + b };
          case 'subtract': return { out: a - b };
          case 'divide': return { out: b === 0 ? 0 : a / b };
          case 'min': return { out: Math.min(a, b) };
          case 'max': return { out: Math.max(a, b) };
          case 'power': return { out: Math.pow(Math.max(0, a), b) };
          default: return { out: a * b };
        }
      }
    };
  }
});

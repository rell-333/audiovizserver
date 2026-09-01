import { defineNode } from '@/lib/editor/defineNode';
import { num } from '@/lib/editor/filterPass';

// A hand slider. Also the thing to reach for when you want a fixed
// value feeding several places at once.
export default defineNode({
  type: 'constant',
  label: 'Constant',
  category: 'source',
  outputs: [{ id: 'out', label: 'Out', kind: 'value' }],
  params: [{ id: 'value', label: 'Value', kind: 'number', min: -4, max: 4, step: 0.01, default: 1 }],
  createRuntime() {
    return { evalValues: ({ params }) => ({ out: num(params, 'value', 1) }) };
  }
});

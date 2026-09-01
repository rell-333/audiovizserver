import { defineNode } from '@/lib/editor/defineNode';
import { num } from '@/lib/editor/filterPass';

// A hard router: no shader pass, just picks which incoming texture
// becomes the output. Since "select" is a number param it auto-gets an
// input port (per defineNode's param convention), so you can drive it
// from a beat/LFO/section node for live switching without a mixer node.
export default defineNode({
  type: 'switcher',
  label: 'Switcher',
  category: 'routing',
  description: 'Routes one of four texture inputs to the output. Wire a modulator into Select to switch live.',
  inputs: [
    { id: 'a', label: 'Input A', kind: 'texture' },
    { id: 'b', label: 'Input B', kind: 'texture' },
    { id: 'c', label: 'Input C', kind: 'texture' },
    { id: 'd', label: 'Input D', kind: 'texture' }
  ],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [{ id: 'select', label: 'Select', kind: 'number', min: 0, max: 3, step: 1, default: 0 }],
  createRuntime() {
    const keys = ['a', 'b', 'c', 'd'] as const;
    return {
      renderTexture: (args) => {
        const idx = Math.round(num(args.params, 'select', 0));
        const clamped = Math.max(0, Math.min(keys.length - 1, idx));
        return args.textures[keys[clamped]] ?? args.textures.a ?? null;
      },
      dispose: () => {}
    };
  }
});

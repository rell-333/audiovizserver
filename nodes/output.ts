import { defineNode } from '@/lib/editor/defineNode';

// Whatever lands here is what goes to the screen. The engine looks for
// this node by type, so there should be exactly one in a patch.
export default defineNode({
  type: 'output',
  label: 'Output',
  category: 'output',
  description: 'Final image sent to the display.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  createRuntime() {
    return {};
  }
});

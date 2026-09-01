import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass } from '@/lib/editor/filterPass';
import { CrossHatchFilter } from 'pixi-filters';
import type { Filter } from 'pixi.js';

// CrossHatchFilter has no adjustable parameters upstream - it's a fixed
// screen-space pen-hatching look. Included as a one-click drop-in;
// combine with Mix/Blend nodes upstream if you want to fade it in.
export default defineNode({
  type: 'crosshatch',
  label: 'Cross Hatch',
  category: 'effect',
  description: 'Fixed pen cross-hatching pattern, shaded by luminance.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new CrossHatchFilter() as unknown as Filter],
      update() {
        // No parameters to sync.
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

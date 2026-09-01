import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { TileFilter } from '@/lib/pixi/tileFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
  type: 'tile',
  label: 'Tile',
  category: 'effect',
  description: 'Repeats the image across a grid. Mirror gives seamless tiling for non-tileable sources.',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'tilesX', label: 'Tiles X', kind: 'number', min: 1, max: 20, step: 1, default: 3 },
    { id: 'tilesY', label: 'Tiles Y', kind: 'number', min: 1, max: 20, step: 1, default: 3 },
    { id: 'rotation', label: 'Rotation', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
    { id: 'mirror', label: 'Mirror Tiling', kind: 'boolean', default: false }
  ],
  createRuntime() {
    const pass = createFilterPass({
      create: () => [new TileFilter({ tilesX: 3, tilesY: 3 }) as unknown as Filter],
      update(filters, { params }) {
        const f = filters[0] as unknown as TileFilter;
        f.tilesX = num(params, 'tilesX', 3);
        f.tilesY = num(params, 'tilesY', 3);
        f.rotation = num(params, 'rotation', 0);
        f.mirror = Boolean(params.mirror);
      }
    });
    return {
      renderTexture: (args) => pass.render(args.textures.image ?? null, args),
      dispose: () => pass.dispose()
    };
  }
});

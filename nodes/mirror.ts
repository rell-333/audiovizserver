import { defineNode } from '@/lib/editor/defineNode';
import { createFilterPass, num } from '@/lib/editor/filterPass';
import { MirrorFilter } from '@/lib/pixi/mirrorFilter';
import type { Filter } from 'pixi.js';

export default defineNode({
    type: 'mirror',
    label: 'Mirror',
    category: 'effect',
    description: 'Reflects one half of the frame across a line onto the other.',
    inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
    outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
    params: [
        { id: 'angle', label: 'Angle', kind: 'number', min: 0, max: 6.28, step: 0.01, default: 0 },
        { id: 'centreX', label: 'Centre X', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'centreY', label: 'Centre Y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 },
        { id: 'flip', label: 'Flip Side', kind: 'boolean', default: false }
    ],
    createRuntime() {
        const pass = createFilterPass({
            create: () => [new MirrorFilter({ angle: 0, mix: 1 }) as unknown as Filter],
            update(filters, { params, ctx }) {
                const f = filters[0] as unknown as MirrorFilter;
                f.angle = num(params, 'angle', 0);
                f.mix = num(params, 'mix', 1);
                f.flip = Boolean(params.flip);
                f.setCentre(num(params, 'centreX', 0.5) * ctx.width, num(params, 'centreY', 0.5) * ctx.height);
            }
        });
        return {
            renderTexture: (args) => pass.render(args.textures.image ?? null, args),
            dispose: () => pass.dispose()
        };
    }
});
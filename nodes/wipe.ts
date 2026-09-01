import { defineNode } from '@/lib/editor/defineNode';
import { num, str } from '@/lib/editor/filterPass';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

// A directional reveal: B wipes in over A as Progress goes 0 to 1.
// Progress is a number param, so it auto-gets an input port - wire a
// section/beat/LFO node into it to trigger wipes live instead of
// hand-scrubbing a slider.
export default defineNode({
  type: 'wipe',
  label: 'Wipe',
  category: 'composite',
  description: 'Directional reveal of B over A. Wire a modulator into Progress to trigger wipes live.',
  inputs: [
    { id: 'a', label: 'A (under)', kind: 'texture' },
    { id: 'b', label: 'B (wipes in)', kind: 'texture' }
  ],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'progress', label: 'Progress', kind: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    {
      id: 'direction',
      label: 'Direction',
      kind: 'enum',
      options: ['leftToRight', 'rightToLeft', 'topToBottom', 'bottomToTop'],
      default: 'leftToRight'
    }
  ],
  createRuntime() {
    let container: Container | null = null;
    let sa: Sprite | null = null;
    let sb: Sprite | null = null;
    let wipeMask: Graphics | null = null;

    return {
      renderTexture({ textures, params, ctx }) {
        const a = textures.a ?? null;
        const b = textures.b ?? null;
        if (!a && !b) return null;

        if (!container) {
          container = new Container();
          sa = new Sprite(Texture.EMPTY);
          sb = new Sprite(Texture.EMPTY);
          wipeMask = new Graphics();
          container.addChild(sa, sb, wipeMask);
        }

        sa!.texture = a ?? Texture.EMPTY;
        sa!.visible = !!a;
        sa!.width = ctx.width;
        sa!.height = ctx.height;

        const progress = Math.max(0, Math.min(1, num(params, 'progress', 0)));
        const direction = str(params, 'direction', 'leftToRight');

        let x = 0, y = 0, w = ctx.width, h = ctx.height;
        if (direction === 'leftToRight') {
            w = ctx.width * progress;
        } else if (direction === 'rightToLeft') {
            x = ctx.width * (1 - progress);
            w = ctx.width * progress;
        } else if (direction === 'topToBottom') {
            h = ctx.height * progress;
        } else {
            y = ctx.height * (1 - progress);
            h = ctx.height * progress;
        }

        wipeMask!.clear();
        wipeMask!.rect(x, y, w, h).fill(0xffffff);

        sb!.texture = b ?? Texture.EMPTY;
        sb!.visible = !!b && progress > 0;
        sb!.width = ctx.width;
        sb!.height = ctx.height;
        sb!.mask = wipeMask;

        const target = ctx.acquireTarget();
        ctx.app.renderer.render({ container, target, clear: true });
        return target;
      },
      dispose() {
        if (sb) sb.mask = null;
        sa?.destroy();
        sb?.destroy();
        wipeMask?.destroy();
        container?.destroy();
        container = null;
        sa = null;
        sb = null;
        wipeMask = null;
      }
    };
  }
});

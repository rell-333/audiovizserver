import { defineNode } from '@/lib/editor/defineNode';
import { Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { num } from '@/lib/editor/filterPass';

// Frame feedback: this frame composited over a scaled copy of the last
// one. Compounds into infinite tunnels and trails.
//
// Two render textures are ping-ponged because a texture can't be read
// and written in the same pass. Nearest-neighbour sampling on purpose:
// bilinear filtering on a full-frame scaled blit is one of the most
// expensive things you can ask a GPU to do per frame, and the echo gets
// overdrawn constantly so the quality difference is invisible.
export default defineNode({
  type: 'feedback',
  label: 'Feedback',
  category: 'effect',
  inputs: [{ id: 'image', label: 'Image', kind: 'texture' }],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'amount', label: 'Amount', kind: 'number', min: 0, max: 0.99, step: 0.01, default: 0.85 },
    { id: 'scale', label: 'Zoom', kind: 'number', min: 0.9, max: 1.1, step: 0.001, default: 1.03 },
    { id: 'rotate', label: 'Rotate', kind: 'number', min: -0.1, max: 0.1, step: 0.001, default: 0.004 }
  ],
  createRuntime() {
    let container: Container | null = null;
    let echo: Sprite | null = null;
    let current: Sprite | null = null;
    let rtA: RenderTexture | null = null;
    let rtB: RenderTexture | null = null;

    return {
      renderTexture({ textures, params, ctx }) {
        const input = textures.image;
        if (!input) return null;

        if (!container) {
          container = new Container();
          echo = new Sprite(Texture.EMPTY);
          echo.anchor.set(0.5);
          current = new Sprite(Texture.EMPTY);
          container.addChild(echo, current);
        }
        if (!rtA || rtA.width !== ctx.width || rtA.height !== ctx.height) {
          rtA?.destroy(true);
          rtB?.destroy(true);
          rtA = RenderTexture.create({ width: ctx.width, height: ctx.height });
          rtB = RenderTexture.create({ width: ctx.width, height: ctx.height });
        }

        echo!.texture = rtA!;
        echo!.position.set(ctx.width / 2, ctx.height / 2);
        echo!.width = ctx.width;
        echo!.height = ctx.height;
        echo!.scale.x *= num(params, 'scale', 1.03);
        echo!.scale.y *= num(params, 'scale', 1.03);
        echo!.rotation += num(params, 'rotate', 0.004);
        echo!.alpha = num(params, 'amount', 0.85);

        current!.texture = input;
        current!.width = ctx.width;
        current!.height = ctx.height;

        ctx.app.renderer.render({ container, target: rtB!, clear: true });
        const swap = rtA;
        rtA = rtB;
        rtB = swap;
        return rtA!;
      },
      dispose() {
        echo?.destroy();
        current?.destroy();
        container?.destroy();
        rtA?.destroy(true);
        rtB?.destroy(true);
        container = null;
        echo = null;
        current = null;
        rtA = null;
        rtB = null;
      }
    };
  }
});

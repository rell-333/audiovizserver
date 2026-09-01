import { defineNode } from '@/lib/editor/defineNode';
import { Container, Sprite, Texture } from 'pixi.js';
import { num, str } from '@/lib/editor/filterPass';

export default defineNode({
  type: 'blend',
  label: 'Blend',
  category: 'composite',
  description: 'Composite B over A.',
  inputs: [
    { id: 'a', label: 'A (under)', kind: 'texture' },
    { id: 'b', label: 'B (over)', kind: 'texture' }
  ],
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'mode', label: 'Mode', kind: 'enum', options: ['normal', 'add', 'multiply', 'screen', 'overlay', 'difference'], default: 'normal' },
    { id: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 }
  ],
  createRuntime() {
    let container: Container | null = null;
    let sa: Sprite | null = null;
    let sb: Sprite | null = null;
    return {
      renderTexture({ textures, params, ctx }) {
        const a = textures.a ?? null;
        const b = textures.b ?? null;
        if (!a && !b) return null;
        if (!container) {
          container = new Container();
          sa = new Sprite(Texture.EMPTY);
          sb = new Sprite(Texture.EMPTY);
          container.addChild(sa, sb);
        }
        sa!.texture = a ?? Texture.EMPTY;
        sa!.visible = !!a;
        sa!.width = ctx.width;
        sa!.height = ctx.height;

        sb!.texture = b ?? Texture.EMPTY;
        sb!.visible = !!b;
        sb!.width = ctx.width;
        sb!.height = ctx.height;
        sb!.alpha = num(params, 'opacity', 1);
        sb!.blendMode = str(params, 'mode', 'normal') as never;

        const target = ctx.acquireTarget();
        ctx.app.renderer.render({ container, target, clear: true });
        return target;
      },
      dispose() {
        sa?.destroy();
        sb?.destroy();
        container?.destroy();
        container = null;
        sa = null;
        sb = null;
      }
    };
  }
});

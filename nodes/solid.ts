import { defineNode } from '@/lib/editor/defineNode';
import { Container, Graphics } from 'pixi.js';
import { num } from '@/lib/editor/filterPass';
import { PALETTE_HEX } from '@/lib/palette';

// Flat colour. Useful as a blend layer or a background under something
// with transparency.
export default defineNode({
  type: 'solid',
  label: 'Solid Colour',
  category: 'generator',
  outputs: [{ id: 'out', label: 'Image', kind: 'texture' }],
  params: [
    { id: 'palette', label: 'Palette Index', kind: 'number', min: 0, max: 4, step: 1, default: 2 },
    { id: 'alpha', label: 'Alpha', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 }
  ],
  createRuntime() {
    let container: Container | null = null;
    let gfx: Graphics | null = null;
    return {
      renderTexture({ params, ctx }) {
        if (!container) {
          container = new Container();
          gfx = new Graphics();
          container.addChild(gfx);
        }
        const idx = Math.round(num(params, 'palette', 2)) % PALETTE_HEX.length;
        gfx!.clear();
        gfx!.rect(0, 0, ctx.width, ctx.height)
          .fill({ color: PALETTE_HEX[idx], alpha: num(params, 'alpha', 1) });
        const target = ctx.acquireTarget();
        ctx.app.renderer.render({ container, target, clear: true });
        return target;
      },
      dispose() {
        gfx?.destroy();
        container?.destroy();
        container = null;
        gfx = null;
      }
    };
  }
});

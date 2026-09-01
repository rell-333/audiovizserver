import { Application } from 'pixi.js';

// Exactly one WebGL context for the whole site, for the whole life of
// the browser tab.
//
// Both the main visualizer (app/page.tsx) and the node editor
// (app/editor/page.tsx) render through this same Application instead of
// each creating their own. Repeatedly creating and destroying contexts
// (once per route visit, once per hot reload) is what was exhausting
// the browser's context budget and surfacing as "WebGL context lost"
// errors that had nothing to do with any shader.
//
// This module is a plain singleton, not tied to any component's
// lifecycle, so it survives route navigation between `/` and `/editor`
// (Next's App Router doesn't remount the module graph on navigation)
// and survives Fast Refresh of any file other than this one.
//
// The canvas is created detached from the DOM. A WebGL context doesn't
// need its canvas attached to be valid - see PixiSurface.tsx, which
// physically moves this one DOM node into whichever page currently
// wants to display it.

let app: Application | null = null;
let canvas: HTMLCanvasElement | null = null;
let initPromise: Promise<Application> | null = null;
let contextLost = false;

export function getSharedCanvas(): HTMLCanvasElement {
    if (!canvas) canvas = document.createElement('canvas');
    return canvas;
}

export function isContextLost(): boolean {
    return contextLost;
}

export async function ensureSharedApp(): Promise<Application> {
    if (app) return app;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const el = getSharedCanvas();
        const instance = new Application();
        await instance.init({
            canvas: el,
            width: Math.max(2, window.innerWidth),
            height: Math.max(2, window.innerHeight),
            background: 0x07060c,
            antialias: true,
            preference: 'webgl',
            // Deliberately not 'high-performance': on dual-GPU laptops that
            // forces the discrete GPU, and a later GPU switch invalidates any
            // live WebGL context - surfacing as an unrelated-looking shader
            // error much later. Let the OS decide.
            resolution: 1, // pinned rather than devicePixelRatio - see engine.ts
            autoStart: false
        });

        el.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            contextLost = true;
            console.error(
                '[pixiHost] WebGL context lost. This should be rare now that there is only ' +
                'one context for the whole app - if it recurs, it is a genuine GPU/driver issue ' +
                'rather than something in our render code.'
            );
        });
        el.addEventListener('webglcontextrestored', () => {
            contextLost = false;
            console.warn('[pixiHost] WebGL context restored.');
        });

        app = instance;
        return instance;
    })();

    return initPromise;
}

// Intentionally no destroy(). This context is meant to outlive every
// individual page; it only ever goes away when the tab itself closes.
'use client';

import { useEffect, useRef, useState } from 'react';
import { createThemes, themeIds, themeLabels, themeKeyHelp, type ThemeId } from '@/themes';
import { createPixiTheme, pixiThemeIds, pixiThemeLabels, pixiThemeKeyHelp, type PixiThemeId } from '@/lib/pixi';
import { createGainTrackers, normalizePacket, type GainTrackers } from '@/lib/autoGain';
import type { VisualizerData, VisualizerTheme } from '@/lib/types';
import type { PixiTheme, PixiThemeContext } from '@/lib/pixi/types';
import type { Application, Container } from 'pixi.js';

// The dropdown lists GPU themes first, then the Canvas 2D ones.
//
// IMPORTANT lifecycle rule: the PixiJS Application (and the WebGL
// context it owns) is created at most ONCE per page load, the first
// time any GPU theme is selected, and is never destroyed or recreated
// while this component is mounted. Every subsequent theme switch, GPU
// to GPU or GPU to Canvas 2D, only swaps the *scene graph*
// (theme.destroy() then the next theme's setup()), never the context.
//
// An earlier version destroyed and recreated the whole Application on
// every switch (new Application() + app.init() on the same live
// <canvas>). Repeatedly tearing down and recreating a WebGL context on
// one canvas element is a known trigger for driver-level hangs -
// entirely independent of what any theme's own drawing code does - and
// that's what was actually causing the hang reported when switching
// away from a GPU theme once one had already loaded.
//
// NONE of that lifecycle logic changed in this redesign - only the UI
// around it (a gallery grid instead of a <select>, plus a top nav) is
// new. Touching the runtime below risks reintroducing that exact bug.
type AnyThemeId = PixiThemeId | ThemeId;

const ALL_IDS: AnyThemeId[] = [...pixiThemeIds, ...themeIds];
const DEFAULT_ID: AnyThemeId = pixiThemeIds[0];

function isPixiId(id: AnyThemeId): id is PixiThemeId {
  return (pixiThemeIds as readonly string[]).includes(id);
}

function labelFor(id: AnyThemeId): string {
  return isPixiId(id) ? pixiThemeLabels[id] : themeLabels[id as ThemeId];
}

function keyHelpFor(id: AnyThemeId): Array<[string, string]> | undefined {
  return isPixiId(id) ? pixiThemeKeyHelp[id] : themeKeyHelp[id as ThemeId];
}

const MAX_PIXELS = 2_100_000; // ~1920x1080

interface Runtime {
  canvasThemes: Record<ThemeId, VisualizerTheme> | null;
  activeId: AnyThemeId;
  latestData: VisualizerData | null;
  lastFrameTime: number;
  gain: GainTrackers | null;
  ws: WebSocket | null;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  animationFrame: number | null;
  // Pixi: created at most once, see note above. pixiRoot is the single
  // persistent Container added to app.stage; individual themes get a
  // fresh Container underneath it so their own children/filters can be
  // torn down cleanly without touching pixiRoot or the Application.
  pixiApp: Application | null;
  pixiRoot: Container | null;
  pixiTheme: PixiTheme | null;
  pixiThemeContainer: Container | null;
  pixiCtx: PixiThemeContext | null;
  pixiMounting: boolean;
  switchTheme: (id: AnyThemeId) => void;
  handleKeyDown: ((e: KeyboardEvent) => void) | null;
}

export default function VisualizerPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState('connecting...');
  const [connected, setConnected] = useState(false);
  const [activeId, setActiveId] = useState<AnyThemeId>(DEFAULT_ID);
  const [helpVisible, setHelpVisible] = useState(false);
  const [hud, setHud] = useState<{ labels: string[]; hint: string }>({ labels: [], hint: '' });

  // New: gallery overlay state. Starts open so the landing page reads
  // as a gallery first - the default theme is already live behind it.
  const [galleryOpen, setGalleryOpen] = useState(true);

  const runtimeRef = useRef<Runtime>({
    canvasThemes: null,
    activeId: DEFAULT_ID,
    latestData: null,
    lastFrameTime: 0,
    gain: null,
    ws: null,
    reconnectTimeout: null,
    animationFrame: null,
    pixiApp: null,
    pixiRoot: null,
    pixiTheme: null,
    pixiThemeContainer: null,
    pixiCtx: null,
    pixiMounting: false,
    switchTheme: () => {},
    handleKeyDown: null
  });

  useEffect(() => {
    const runtime = runtimeRef.current;
    const canvas2d = canvas2dRef.current;
    const pixiCanvas = pixiCanvasRef.current;
    if (!canvas2d || !pixiCanvas) return;

    const ctx2d = canvas2d.getContext('2d');
    if (!ctx2d) return;

    runtime.canvasThemes = createThemes();
    runtime.gain = createGainTrackers();

    let disposed = false;

    function renderSize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)));
      return { w: Math.round(w * scale), h: Math.round(h * scale) };
    }

    function resize() {
      const { w, h } = renderSize();
      canvas2d!.width = w;
      canvas2d!.height = h;
      if (runtime.pixiApp?.renderer) runtime.pixiApp.renderer.resize(w, h);
      if (runtime.pixiCtx) {
        runtime.pixiCtx.width = w;
        runtime.pixiCtx.height = h;
      }
    }
    window.addEventListener('resize', resize);
    resize();

    // Creates the Pixi Application. Called at most once per page load,
    // lazily, the first time a GPU theme is actually needed. Never
    // called again after that, even if you switch away and back many
    // times, only teardownActiveTheme()/setupTheme() run on subsequent
    // switches.
    async function ensurePixiApp(): Promise<void> {
      if (runtime.pixiApp || runtime.pixiMounting) return;
      runtime.pixiMounting = true;

      // Imported lazily so the Pixi bundle isn't downloaded unless a
      // GPU theme is actually selected.
      const { Application, Container } = await import('pixi.js');
      if (disposed) {
        runtime.pixiMounting = false;
        return;
      }

      const { w, h } = renderSize();
      const app = new Application();
      await app.init({
        canvas: pixiCanvas!,
        width: w,
        height: h,
        background: 0xf4ecdf,
        antialias: true,
        preference: 'webgl',
        powerPreference: 'high-performance',
        // We drive rendering from our own loop, alongside the websocket
        // data, so Pixi's internal ticker is left off.
        autoStart: false
      });
      if (disposed) {
        app.destroy();
        runtime.pixiMounting = false;
        return;
      }

      const root = new Container();
      app.stage.addChild(root);

      runtime.pixiApp = app;
      runtime.pixiRoot = root;
      runtime.pixiMounting = false;
    }

    function teardownActiveTheme() {
      runtime.pixiTheme?.destroy();
      runtime.pixiTheme = null;
      if (runtime.pixiThemeContainer) {
        runtime.pixiThemeContainer.filters = [];
        runtime.pixiRoot?.removeChild(runtime.pixiThemeContainer);
        runtime.pixiThemeContainer.destroy({ children: true });
        runtime.pixiThemeContainer = null;
      }
      runtime.pixiCtx = null;
      setHud({ labels: [], hint: '' });
    }

    async function setupPixiTheme(id: PixiThemeId) {
      await ensurePixiApp();
      if (disposed || !runtime.pixiApp || !runtime.pixiRoot) return;

      teardownActiveTheme();

      const { w, h } = renderSize();
      // Each theme gets its own Container under the persistent
      // pixiRoot, so a theme's filters/children are fully scoped to it
      // and torn down independently of the Application itself.
      const { Container } = await import('pixi.js');
      const themeContainer = new Container();
      runtime.pixiRoot.addChild(themeContainer);

      const theme = createPixiTheme(id);
      const themeCtx: PixiThemeContext = { app: runtime.pixiApp, root: themeContainer, width: w, height: h };
      theme.setup(themeCtx);

      const withStatus = theme as PixiTheme & {
        setStatusHandler?: (fn: (labels: string[], hint: string) => void) => void;
      };
      withStatus.setStatusHandler?.((labels, hint) => setHud({ labels, hint }));

      runtime.pixiTheme = theme;
      runtime.pixiThemeContainer = themeContainer;
      runtime.pixiCtx = themeCtx;
    }

    function switchTheme(id: AnyThemeId) {
      if (id === runtime.activeId && (runtime.pixiTheme || !isPixiId(id))) return;

      if (!isPixiId(id)) {
        const theme = runtime.canvasThemes?.[id as ThemeId];
        if (!theme) {
          console.warn(`Theme "${id}" is listed but has no implementation - staying on the current one.`);
          return;
        }
        // Leaving a GPU theme: tear down its scene graph, but the
        // Application/context itself is left running (just not
        // rendered to, see animate() below) so no context churn
        // happens here at all.
        if (runtime.pixiTheme) teardownActiveTheme();
        runtime.activeId = id;
        setActiveId(id);
        theme.init(canvas2d!);
        return;
      }

      runtime.activeId = id;
      setActiveId(id);
      void setupPixiTheme(id);
    }
    runtime.switchTheme = switchTheme;

    // Initial mount.
    runtime.activeId = DEFAULT_ID;
    if (isPixiId(DEFAULT_ID)) void setupPixiTheme(DEFAULT_ID);
    else runtime.canvasThemes?.[DEFAULT_ID as ThemeId]?.init(canvas2d);

    function animate() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - runtime.lastFrameTime) / 1000);
      runtime.lastFrameTime = now;

      const data = runtime.latestData;
      if (isPixiId(runtime.activeId)) {
        if (runtime.pixiApp && runtime.pixiTheme && runtime.pixiCtx && data) {
          runtime.pixiTheme.update(data, dt, runtime.pixiCtx);
          runtime.pixiApp.render();
        }
      } else {
        const theme = runtime.canvasThemes?.[runtime.activeId as ThemeId];
        if (theme) {
          if (data) theme.update(data, dt);
          theme.draw(ctx2d!, canvas2d!);
        }
      }

      runtime.animationFrame = requestAnimationFrame(animate);
    }
    runtime.lastFrameTime = performance.now();
    animate();

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) return;

      if (e.key === 'Escape') {
        setGalleryOpen(false);
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        setGalleryOpen((v) => !v);
        return;
      }

      if (isPixiId(runtime.activeId)) {
        runtime.pixiTheme?.onKey?.(e.key);
      } else {
        runtime.canvasThemes?.[runtime.activeId as ThemeId]?.onKey?.(e.key);
      }
      setHelpVisible(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    runtime.handleKeyDown = handleKeyDown;

    function connect() {
      const ws = new WebSocket('ws://127.0.0.1:9002');
      runtime.ws = ws;

      ws.onopen = () => {
        setStatus('connected');
        setConnected(true);
      };
      ws.onclose = () => {
        setStatus('disconnected, retrying...');
        setConnected(false);
        runtime.reconnectTimeout = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          runtime.latestData = normalizePacket(parsed, runtime.gain!);
        } catch (err) {
          console.error('Failed to parse packet from plugin', err);
        }
      };
    }
    connect();

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      if (runtime.handleKeyDown) window.removeEventListener('keydown', runtime.handleKeyDown);
      if (runtime.animationFrame) cancelAnimationFrame(runtime.animationFrame);
      if (runtime.reconnectTimeout) clearTimeout(runtime.reconnectTimeout);
      if (runtime.ws) runtime.ws.close();
      // The Application is only ever destroyed here, on the component
      // actually unmounting (e.g. navigating away), not on ordinary
      // theme switches.
      teardownActiveTheme();
      if (runtime.pixiApp) {
        runtime.pixiApp.destroy({ removeView: false }, { children: true });
        runtime.pixiApp = null;
        runtime.pixiRoot = null;
      }
    };
  }, []);

  const activeKeyHelp = keyHelpFor(activeId);
  const usingPixi = isPixiId(activeId);

  return (
      <div ref={hostRef}>
        <div className="topBar">
          <div className={`status${connected ? ' connected' : ''}`}>{status}</div>
          <div className="topBar__right">
            <button className="pill" onClick={() => setGalleryOpen(true)}>templates</button>
            <a className="pill" href="/editor">editor</a>
          </div>
        </div>

        {(hud.labels.length > 0 || hud.hint) && (
            <div className="hud">
              {hud.labels.length > 0 && <div className="hudModes">{hud.labels.join('  ·  ')}</div>}
              {hud.hint && <div className="hudHint">{hud.hint}</div>}
            </div>
        )}

        {activeKeyHelp && (
            <div className={`keyHelp${helpVisible ? ' visible' : ''}`}>
              {activeKeyHelp.map(([key, description]) => (
                  <div className="keyHelpRow" key={key}>
                    <kbd>{key}</kbd>
                    <span>{description}</span>
                  </div>
              ))}
            </div>
        )}

        <canvas ref={canvas2dRef} style={{ display: usingPixi ? 'none' : 'block' }} />
        <canvas ref={pixiCanvasRef} style={{ display: usingPixi ? 'block' : 'none' }} />

        {galleryOpen && (
            <div className="gallery" onClick={(e) => { if (e.target === e.currentTarget) setGalleryOpen(false); }}>
              <div className="gallery__panel">
                <div className="gallery__head">
                  <h2>Templates</h2>
                  <button className="gallery__close" onClick={() => setGalleryOpen(false)} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="gallery__grid">
                  {ALL_IDS.map((id) => (
                      <button
                          key={id}
                          className={`galleryCard${id === activeId ? ' is-active' : ''}`}
                          onClick={() => {
                            runtimeRef.current.switchTheme(id);
                            setGalleryOpen(false);
                          }}
                      >
                        <div className={`galleryCard__swatch galleryCard__swatch--${isPixiId(id) ? 'gpu' : 'canvas'}`} />
                        <div className="galleryCard__name">{labelFor(id)}</div>
                        <div className="galleryCard__tag">{isPixiId(id) ? 'GPU' : 'Canvas'}</div>
                      </button>
                  ))}
                </div>
              </div>
            </div>
        )}
      </div>
  );
}

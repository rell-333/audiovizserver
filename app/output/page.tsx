'use client';

import { useEffect, useRef, useState } from 'react';
import './output.css';
import { PixiSurface } from '../PixiSurface';
import { EditorEngine } from '@/lib/editor/engine';
import { subscribeSync } from '@/lib/outputSync';
import type { VisualizerData } from '@/lib/types';

const IDLE_DATA: VisualizerData = {
    bass: 0, mid: 0, treble: 0, transient: 0, beat: false, bpm: 120,
    beatPhase: 0, intensity: 0, spectrum: [],
    section: '', bassNorm: 0, midNorm: 0, trebleNorm: 0, spectrumNorm: []
};

// The clean output window. No palette, no inspector, no graph - just
// whatever /editor is currently patched to, mirrored live over
// BroadcastChannel (see lib/outputSync.ts). This is a separate
// tab/window with its own PixiJS Application; nothing here is shared
// with the editor's Application, only the serializable patch and audio
// frame cross over.
//
// Open this via the "Open Output" button in the editor toolbar - that's
// what sizes the window and, on modern browsers, requests fullscreen up
// front. Opening this URL directly still works, it just starts
// windowed with a manual fullscreen button.
export default function OutputPage() {
    const engineRef = useRef<EditorEngine>(new EditorEngine());
    const dataRef = useRef<VisualizerData>(IDLE_DATA);
    const rafRef = useRef<number | null>(null);
    const lastRef = useRef(0);
    const linkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [linked, setLinked] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const engine = engineRef.current;

        const unsubscribe = subscribeSync((msg) => {
            if (msg.kind === 'patch') {
                engine.sync(msg.patch);
            } else {
                dataRef.current = msg.data;
            }
            setLinked(true);
            if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
            // If the editor tab closes (or the link just goes quiet for
            // a few seconds), stop claiming to be connected.
            linkTimeoutRef.current = setTimeout(() => setLinked(false), 4000);
        });

        lastRef.current = performance.now();
        function loop() {
            const now = performance.now();
            const dt = Math.min(0.1, (now - lastRef.current) / 1000);
            lastRef.current = now;
            if (engine.ready) engine.frame(dataRef.current, dt);
            rafRef.current = requestAnimationFrame(loop);
        }
        loop();

        function onFsChange() {
            setIsFullscreen(document.fullscreenElement !== null);
        }
        document.addEventListener('fullscreenchange', onFsChange);

        return () => {
            unsubscribe();
            document.removeEventListener('fullscreenchange', onFsChange);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
            engine.detach();
        };
    }, []);

    return (
        <div className="output">
            <PixiSurface
                className="output__canvasHost"
                onReady={(app) => engineRef.current.attach(app, window.innerWidth, window.innerHeight)}
                onResize={(w, h) => engineRef.current.resize(w, h)}
            />

            {!linked && (
                <div className="output__waiting">
                    <div>Waiting for the editor tab to connect…</div>
                    <div className="output__waitingHint">Open /editor in another tab and it'll link automatically.</div>
                </div>
            )}

            {!isFullscreen && (
                <button
                    className="output__fsBtn"
                    onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
                >
                    Fullscreen
                </button>
            )}
        </div>
    );
}

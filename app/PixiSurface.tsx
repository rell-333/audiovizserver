'use client';

import { useEffect, useRef } from 'react';
import { ensureSharedApp, getSharedCanvas } from '@/lib/pixiHost';
import type { Application } from 'pixi.js';

interface Props {
    className?: string;
    onReady(app: Application): void;
    onResize?(width: number, height: number): void;
}

// A DOM node can only have one parent, so appending the shared canvas
// here automatically detaches it from wherever it was previously
// mounted (e.g. the other page, if you navigated over without a full
// reload). Nothing about the Application itself is touched - same
// context, same everything, it's just being displayed somewhere else.
export function PixiSurface({ className, onReady, onResize }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let disposed = false;
        let observer: ResizeObserver | null = null;

        (async () => {
            const app = await ensureSharedApp();
            if (disposed) return;

            const canvas = getSharedCanvas();
            container.appendChild(canvas);
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';

            const resize = () => {
                const rect = container.getBoundingClientRect();
                const w = Math.max(2, Math.round(rect.width));
                const h = Math.max(2, Math.round(rect.height));
                app.renderer.resize(w, h);
                onResize?.(w, h);
            };
            resize();

            observer = new ResizeObserver(resize);
            observer.observe(container);

            onReady(app);
        })();

        return () => {
            disposed = true;
            observer?.disconnect();
            // The canvas is deliberately left in the DOM as-is on unmount -
            // whichever page mounts PixiSurface next will simply move it into
            // its own container. Nothing is destroyed here.
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} className={className} />;
}
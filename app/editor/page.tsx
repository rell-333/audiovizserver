'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    addEdge,
    useNodesState,
    useEdgesState,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './editor.css';

import { PatchNodeView } from './PatchNodeView';
import { PatchEdge } from './PatchEdge';
import { ConnectingKindProvider, type PortKind } from './ConnectingContext';
import { Inspector } from './Inspector';
import * as localAudio from '@/lib/editor/localAudioSource';
import { PixiSurface } from '../PixiSurface';
import {
    allNodeDefs,
    categoryOrder,
    defaultParams,
    getNodeDef,
    inputPortsFor,
    outputPortsFor,
    isParamPort,
    paramIdFromPort,
    paramPortId
} from '@/lib/editor/registry';
import { EditorEngine, type EngineStats } from '@/lib/editor/engine';
import { createGainTrackers, normalizePacket, type GainTrackers } from '@/lib/autoGain';
import { broadcastPatch, broadcastData } from '@/lib/outputSync';
import type { Patch, ParamValue } from '@/lib/editor/types';
import type { VisualizerData } from '@/lib/types';

// The editor now opens on a blank patch - "reset" and the initial mount
// both go through here, so there's exactly one definition of "empty".
function starterPatch(): { nodes: Node[]; edges: Edge[] } {
    return { nodes: [], edges: [] };
}

const nodeTypes: NodeTypes = { patch: PatchNodeView };
const edgeTypes = { patchEdge: PatchEdge };

// The save/load JSON format, kept separate from the engine-facing Patch
// type: exposedParams is purely an editor UI concern (which param ports
// are visible on a node), the engine never needs to know about it, so
// there's no reason to touch lib/editor/types.ts for this.
interface SavedPatchNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    params: Record<string, ParamValue>;
    exposedParams?: string[];
}
interface SavedPatchEdge {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
}
interface SavedPatch {
    version: number;
    nodes: SavedPatchNode[];
    edges: SavedPatchEdge[];
}

export default function EditorPage() {
    const starter = useMemo(starterPatch, []);
    const [nodes, setNodes, onNodesChange] = useNodesState(starter.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(starter.edges);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [stats, setStats] = useState<EngineStats>({ frameMs: 0, texturePasses: 0, nodeCount: 0, cycleCount: 0 });
    const [connected, setConnected] = useState(false);
    const [renderScale, setRenderScale] = useState(1);
    const [fullscreen, setFullscreen] = useState(false);
    const [audioFileName, setAudioFileName] = useState<string | null>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [connectingKind, setConnectingKind] = useState<PortKind | null>(null);
    const [paletteSearch, setPaletteSearch] = useState('');

    useEffect(() => {
        return localAudio.subscribe(() => {
            setAudioFileName(localAudio.getFileName());
            setAudioPlaying(localAudio.isPlaying());
        });
    }, []);

    const handleAudioFile = useCallback((file: File | undefined | null) => {
        if (!file || !file.type.startsWith('audio/')) return;
        void localAudio.loadFile(file);
    }, []);
    const [paletteOpen, setPaletteOpen] = useState(true);

    const engineRef = useRef<EditorEngine>(new EditorEngine());
    const dataRef = useRef<VisualizerData | null>(null);
    const gainRef = useRef<GainTrackers | null>(null);
    const rafRef = useRef<number | null>(null);
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // ---- engine lifecycle ------------------------------------------
    // The Application itself comes from PixiSurface, which attaches the
    // one shared context (see lib/pixiHost.ts) - this effect only starts
    // and stops this page's own render loop, it never creates or destroys
    // any GPU resource.
    useEffect(() => {
        gainRef.current = createGainTrackers();
        const engine = engineRef.current;

        let last = performance.now();
        const loop = () => {
            const now = performance.now();
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;

            if (engine.ready) {
                // Local file playback takes priority over the websocket feed
                // when it's the thing actually playing: analyze() is the one
                // place per frame that samples the analyser and runs beat
                // detection (see localAudioSource.ts) - the localAudio node's
                // own graph outputs read this same cached result, so ctx.data
                // and that node never disagree about a given frame.
                const data: VisualizerData =
                    localAudio.isLoaded() && localAudio.isPlaying()
                        ? (() => {
                            const f = localAudio.analyze();
                            return {
                                bass: f.bass, mid: f.mid, treble: f.treble,
                                transient: 0, beat: f.beat, bpm: f.bpm,
                                beatPhase: f.beatPhase, intensity: f.intensity, spectrum: f.spectrum,
                                section: 'Local File',
                                bassNorm: f.bass, midNorm: f.mid, trebleNorm: f.treble,
                                spectrumNorm: f.spectrum
                            } as VisualizerData;
                        })()
                        : dataRef.current ??
                        ({
                            bass: 0, mid: 0, treble: 0, transient: 0, beat: false, bpm: 120,
                            beatPhase: (now / 1000) % 1, intensity: 0.5, spectrum: [],
                            section: 'Intro', bassNorm: 0, midNorm: 0, trebleNorm: 0, spectrumNorm: []
                        } as VisualizerData);

                engine.frame(data, dt);
                // Mirror the exact frame this tab just rendered to any
                // open /output window - same data regardless of whether
                // it came from the websocket or a local file, since
                // /output has no opinion of its own about audio source.
                broadcastData(data);
                setStats({ ...engine.stats });
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        loop();

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            engine.detach();
        };
    }, []);

    // ---- audio feed --------------------------------------------------
    useEffect(() => {
        let ws: WebSocket | null = null;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let closed = false;

        function connect() {
            ws = new WebSocket('ws://127.0.0.1:9002');
            ws.onopen = () => setConnected(true);
            ws.onclose = () => {
                setConnected(false);
                if (!closed) retry = setTimeout(connect, 1500);
            };
            ws.onerror = () => ws?.close();
            ws.onmessage = (e) => {
                try {
                    dataRef.current = normalizePacket(JSON.parse(e.data), gainRef.current!);
                } catch {
                    /* ignore malformed packet */
                }
            };
        }
        connect();
        return () => {
            closed = true;
            if (retry) clearTimeout(retry);
            ws?.close();
        };
    }, []);

    // ---- push graph edits straight to the running engine ---------------
    // This is what makes edits apply to the live feed instantly: the
    // engine diffs and keeps every surviving node's state, so nothing on
    // screen restarts when you tweak the patch.
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        const patch: Patch = {
            version: 1,
            nodes: nodes.map((n) => ({
                id: n.id,
                type: (n.data as { type: string }).type,
                position: n.position,
                params: (n.data as { params: Record<string, ParamValue> }).params ?? {}
            })),
            edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                sourceHandle: e.sourceHandle ?? '',
                target: e.target,
                targetHandle: e.targetHandle ?? ''
            }))
        };
        engine.sync(patch);
        // Edits are rare relative to frame rate, so the patch goes out
        // the moment it changes rather than waiting on the frame loop -
        // an open /output window re-syncs its own engine immediately.
        broadcastPatch(patch);
    }, [nodes, edges]);

    useEffect(() => {
        engineRef.current?.setRenderScale(renderScale);
    }, [renderScale]);

    // ---- graph editing -----------------------------------------------
    // Refuses mismatched wire types, so you can't plug an image into a
    // number and get a silent no-op.
    const isValidConnection = useCallback((c: Connection | Edge) => {
        const src = nodesRef.current.find((n) => n.id === c.source);
        const dst = nodesRef.current.find((n) => n.id === c.target);
        if (!src || !dst) return false;
        const srcDef = getNodeDef((src.data as { type: string }).type);
        const dstDef = getNodeDef((dst.data as { type: string }).type);
        if (!srcDef || !dstDef) return false;
        const out = outputPortsFor(srcDef).find((p) => p.id === c.sourceHandle);
        const inp = inputPortsFor(dstDef).find((p) => p.id === c.targetHandle);
        if (!out || !inp) return false;
        return out.kind === inp.kind;
    }, []);

    const onConnect = useCallback(
        (c: Connection) => {
            if (!isValidConnection(c)) return;
            setEdges((eds) => {
                // One wire per input: a second connection replaces the first,
                // rather than silently stacking.
                const cleaned = eds.filter(
                    (e) => !(e.target === c.target && e.targetHandle === c.targetHandle)
                );
                return addEdge({ ...c, animated: false }, cleaned);
            });
        },
        [isValidConnection, setEdges]
    );

    // Tracks what kind of port would complete the wire currently being
    // dragged, broadcast via ConnectingKindProvider so every node can
    // glow its compatible handles and dim the rest - purely a visual
    // affordance, doesn't affect what isValidConnection actually allows.
    const onConnectStart = useCallback(
        (_: unknown, params: { nodeId: string | null; handleId: string | null; handleType: 'source' | 'target' | null }) => {
            const node = nodesRef.current.find((n) => n.id === params.nodeId);
            if (!node) return;
            const def = getNodeDef((node.data as { type: string }).type);
            if (!def) return;
            const ports = params.handleType === 'source' ? outputPortsFor(def) : inputPortsFor(def);
            const port = ports.find((p) => p.id === params.handleId);
            setConnectingKind(port?.kind ?? null);
        },
        []
    );
    const onConnectEnd = useCallback(() => setConnectingKind(null), []);

    const addNode = useCallback(
        (type: string) => {
            const def = getNodeDef(type);
            if (!def) return;
            const id = `${type}_${Math.random().toString(36).slice(2, 8)}`;
            setNodes((ns) => [
                ...ns,
                {
                    id,
                    type: 'patch',
                    position: { x: 120 + Math.random() * 360, y: 80 + Math.random() * 320 },
                    data: { type, params: defaultParams(def), exposedParams: [] }
                }
            ]);
        },
        [setNodes]
    );

    // Single source of truth for removing a node: strips the node itself
    // plus every edge touching it, and clears selection if it was selected.
    // Used by both the Inspector's delete button and React Flow's own
    // keyboard/marquee delete (via onNodesDelete below), so there's no
    // path that removes a node but leaves its wires dangling.
    const deleteNode = useCallback(
        (id: string) => {
            setNodes((ns) => ns.filter((n) => n.id !== id));
            setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
            setSelectedId((cur) => (cur === id ? null : cur));
        },
        [setNodes, setEdges]
    );

    const onNodesDelete = useCallback(
        (deleted: Node[]) => {
            const ids = new Set(deleted.map((n) => n.id));
            setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
            setSelectedId((cur) => (cur && ids.has(cur) ? null : cur));
        },
        [setEdges]
    );

    const updateParam = useCallback(
        (paramId: string, value: ParamValue) => {
            if (!selectedId) return;
            setNodes((ns) =>
                ns.map((n) =>
                    n.id === selectedId
                        ? {
                            ...n,
                            data: {
                                ...(n.data as object),
                                params: { ...((n.data as { params: Record<string, ParamValue> }).params ?? {}), [paramId]: value }
                            }
                        }
                        : n
                )
            );
        },
        [selectedId, setNodes]
    );

    // Toggles whether a param has a visible, wireable port on the node
    // card (see PatchNodeView - a param-derived port only renders when
    // its id is in this set). Hiding a param that currently has a live
    // wire also drops that wire: a port that's about to disappear can't
    // be left with an edge dangling off it, same reasoning as node
    // deletion cleaning up its edges.
    const toggleExposeParam = useCallback(
        (paramId: string) => {
            if (!selectedId) return;
            const node = nodesRef.current.find((n) => n.id === selectedId);
            if (!node) return;
            const current: string[] = (node.data as { exposedParams?: string[] }).exposedParams ?? [];
            const wasExposed = current.includes(paramId);
            const next = wasExposed ? current.filter((p) => p !== paramId) : [...current, paramId];

            setNodes((ns) =>
                ns.map((n) => (n.id === selectedId ? { ...n, data: { ...(n.data as object), exposedParams: next } } : n))
            );

            if (wasExposed) {
                const portId = paramPortId(paramId);
                setEdges((eds) => eds.filter((e) => !(e.target === selectedId && e.targetHandle === portId)));
            }
        },
        [selectedId, setNodes, setEdges]
    );

    // ---- save / load ---------------------------------------------------
    const savePatch = useCallback(() => {
        const patch: SavedPatch = {
            version: 1,
            nodes: nodes.map((n) => ({
                id: n.id,
                type: (n.data as { type: string }).type,
                position: n.position,
                params: (n.data as { params: Record<string, ParamValue> }).params ?? {},
                exposedParams: (n.data as { exposedParams?: string[] }).exposedParams ?? []
            })),
            edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                sourceHandle: e.sourceHandle ?? '',
                target: e.target,
                targetHandle: e.targetHandle ?? ''
            }))
        };
        const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'patch.json';
        a.click();
        URL.revokeObjectURL(a.href);
        try {
            localStorage.setItem('visualizer.patch', JSON.stringify(patch));
        } catch {
            /* storage may be unavailable; the file download already happened */
        }
    }, [nodes, edges]);

    const loadPatchObject = useCallback(
        (patch: SavedPatch) => {
            // Backward compatibility: a patch saved before exposedParams
            // existed (or one with an edge into a param port that isn't
            // listed as exposed for some other reason) shouldn't silently
            // lose that port on load - a node's exposed set is the union
            // of what's explicitly saved and whatever its incoming edges
            // actually need.
            const wiredParamsByNode = new Map<string, Set<string>>();
            for (const e of patch.edges) {
                if (isParamPort(e.targetHandle)) {
                    const set = wiredParamsByNode.get(e.target) ?? new Set<string>();
                    set.add(paramIdFromPort(e.targetHandle));
                    wiredParamsByNode.set(e.target, set);
                }
            }

            setNodes(
                patch.nodes.map((n) => {
                    const wired = wiredParamsByNode.get(n.id);
                    const explicit = n.exposedParams ?? [];
                    const exposedParams = wired ? Array.from(new Set([...explicit, ...wired])) : explicit;
                    return {
                        id: n.id,
                        type: 'patch',
                        position: n.position,
                        data: { type: n.type, params: n.params, exposedParams }
                    };
                })
            );
            setEdges(
                patch.edges.map((e) => ({
                    id: e.id,
                    source: e.source,
                    sourceHandle: e.sourceHandle,
                    target: e.target,
                    targetHandle: e.targetHandle
                }))
            );
        },
        [setNodes, setEdges]
    );

    const loadFromFile = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                loadPatchObject(JSON.parse(await file.text()) as SavedPatch);
            } catch (err) {
                console.error('Could not read that patch file', err);
            }
        };
        input.click();
    }, [loadPatchObject]);

    // Opens the clean render window, sized for dragging onto a second
    // monitor/projector. It links automatically over BroadcastChannel
    // (see lib/outputSync.ts) as soon as it mounts - once it's on the
    // right screen, its own "Fullscreen" button takes it full-bleed.
    const openOutputWindow = useCallback(() => {
        window.open(
            '/output',
            'audioviz-output',
            'width=1920,height=1080,left=80,top=80,menubar=no,toolbar=no,location=no,status=no'
        );
    }, []);

    const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

    const grouped = useMemo(() => {
        const term = paletteSearch.trim().toLowerCase();
        const matches = (label: string, type: string) =>
            term.length === 0 || label.toLowerCase().includes(term) || type.toLowerCase().includes(term);
        return categoryOrder
            .map((cat) => ({
                cat,
                defs: allNodeDefs.filter((d) => d.category === cat && matches(d.label, d.type))
            }))
            .filter(({ defs }) => defs.length > 0);
    }, [paletteSearch]);

    return (
        <ConnectingKindProvider value={connectingKind}>
            <div
                className={`editor${fullscreen ? ' is-fullscreen' : ''}${dragOver ? ' is-dragOver' : ''}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleAudioFile(e.dataTransfer.files?.[0]);
                }}
            >
                {dragOver && <div className="editor__dropOverlay">drop an audio file to load it</div>}
                <div className="editor__preview">
                    <PixiSurface
                        className="editor__canvasHost"
                        onReady={(app) => {
                            const rect = document.querySelector('.editor__preview')?.getBoundingClientRect();
                            engineRef.current.attach(app, rect?.width ?? 640, rect?.height ?? 360);
                        }}
                        onResize={(w, h) => engineRef.current.resize(w, h)}
                    />
                    <div className="editor__hud">
                        <span className={connected ? 'ok' : 'bad'}>{connected ? 'audio connected' : 'no audio'}</span>
                        <span>{stats.frameMs.toFixed(1)} ms</span>
                        <span>{stats.texturePasses} passes</span>
                        <span>{stats.nodeCount} nodes</span>
                        {stats.cycleCount > 0 && <span className="bad">{stats.cycleCount} in a cycle</span>}
                    </div>
                    <div className="editor__previewCtl">
                        <label>
                            scale
                            <input
                                type="range"
                                min={0.25}
                                max={1}
                                step={0.05}
                                value={renderScale}
                                onChange={(e) => setRenderScale(parseFloat(e.target.value))}
                            />
                            {Math.round(renderScale * 100)}%
                        </label>
                        <button onClick={() => setFullscreen((f) => !f)}>{fullscreen ? 'exit' : 'fullscreen'}</button>
                    </div>
                </div>

                <div className="editor__lower">
                    {paletteOpen && (
                        <div className="palette">
                            <div className="palette__head">
                                <span>Nodes</span>
                                <button onClick={() => setPaletteOpen(false)}>hide</button>
                            </div>
                            <input
                                className="palette__search"
                                type="text"
                                placeholder="search nodes…"
                                value={paletteSearch}
                                onChange={(e) => setPaletteSearch(e.target.value)}
                            />
                            {grouped.map(
                                ({ cat, defs }) =>
                                    defs.length > 0 && (
                                        <div className="palette__group" key={cat}>
                                            <div className="palette__cat">{cat}</div>
                                            {defs.map((d) => (
                                                <button className="palette__item" key={d.type} onClick={() => addNode(d.type)}>
                                                    {d.label}
                                                </button>
                                            ))}
                                        </div>
                                    )
                            )}
                        </div>
                    )}

                    <div className="editor__graph">
                        {!paletteOpen && (
                            <button className="palette__show" onClick={() => setPaletteOpen(true)}>
                                nodes
                            </button>
                        )}
                        <div className="editor__toolbar">
                            <label className="editor__audioLoad">
                                {audioFileName ? `♪ ${audioFileName}` : 'load audio file'}
                                <input
                                    type="file"
                                    accept="audio/*"
                                    onChange={(e) => handleAudioFile(e.target.files?.[0])}
                                />
                            </label>
                            {audioFileName && (
                                <button className="editor__btn" onClick={() => localAudio.togglePlay()}>
                                    {audioPlaying ? 'pause' : 'play'}
                                </button>
                            )}
                            <a className="editor__btn" href="/">templates</a>
                            <button className="editor__btn editor__btn--primary" onClick={openOutputWindow}>
                                open output
                            </button>
                            <button className="editor__btn" onClick={savePatch}>save</button>
                            <button className="editor__btn" onClick={loadFromFile}>load patch</button>
                            <button
                                className="editor__btn editor__btn--danger"
                                onClick={() => {
                                    const s = starterPatch();
                                    setNodes(s.nodes);
                                    setEdges(s.edges);
                                    setSelectedId(null);
                                }}
                            >
                                reset
                            </button>
                        </div>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onNodesDelete={onNodesDelete}
                            onConnect={onConnect}
                            onConnectStart={onConnectStart}
                            onConnectEnd={onConnectEnd}
                            isValidConnection={isValidConnection}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            defaultEdgeOptions={{ type: 'patchEdge' }}
                            connectionRadius={28}
                            onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
                            deleteKeyCode={['Backspace', 'Delete']}
                            fitView
                            proOptions={{ hideAttribution: false }}
                        >
                            <Background color="#211c33" gap={18} />
                            <Controls />
                        </ReactFlow>
                    </div>

                    <Inspector
                        nodeId={selectedId}
                        nodeType={selectedNode ? (selectedNode.data as { type: string }).type : null}
                        params={selectedNode ? ((selectedNode.data as { params: Record<string, ParamValue> }).params ?? {}) : {}}
                        exposedParams={selectedNode ? ((selectedNode.data as { exposedParams?: string[] }).exposedParams ?? []) : []}
                        edges={edges}
                        onChange={updateParam}
                        onToggleExpose={toggleExposeParam}
                        onDelete={selectedId ? () => deleteNode(selectedId) : undefined}
                    />
                </div>
            </div>
        </ConnectingKindProvider>
    );
}
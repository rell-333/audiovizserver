import { Application, Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { FrameContext, NodeRuntime, ParamValue, Patch } from './types';
import { compileGraph, findOutputNode, type CompiledGraph } from './graph';
import { getNodeDef, isParamPort, paramIdFromPort } from './registry';
import { isContextLost } from '../pixiHost';
import type { VisualizerData } from '../types';

interface NodeInstance {
    id: string;
    type: string;
    runtime: NodeRuntime;
    target: RenderTexture | null;
}

export interface EngineStats {
    frameMs: number;
    texturePasses: number;
    nodeCount: number;
    cycleCount: number;
}

// The runtime behind the editor.
//
// This ATTACHES to an Application it doesn't own (see lib/pixiHost.ts)
// rather than creating and destroying its own. Every visible thing this
// engine renders lives inside its own `stage` Container, which is what
// gets added to and removed from the shared app.stage - detach() tears
// down everything this engine created without touching the Application
// itself, since other pages (or a future re-attach of this same engine)
// need that context to keep working.
//
// Graph edits are applied as a DIFF, never a rebuild: nodes that still
// exist keep their runtime and their state, only genuinely new ones are
// constructed and removed ones disposed. That's what makes an edit apply
// to the live feed instantly rather than restarting it.
export class EditorEngine {
    private app: Application | null = null;
    private stage: Container | null = null;
    private screen: Sprite | null = null;
    private instances = new Map<string, NodeInstance>();
    private compiled: CompiledGraph = { order: [], incoming: new Map(), cycleNodes: [] };
    private patch: Patch = { version: 1, nodes: [], edges: [] };
    private renderScale = 1;
    private time = 0;
    private width = 2;
    private height = 2;

    stats: EngineStats = { frameMs: 0, texturePasses: 0, nodeCount: 0, cycleCount: 0 };

    // Wires this engine up to the shared Application. Cheap and
    // synchronous - the context already exists by the time this is
    // called (see PixiSurface, which awaits ensureSharedApp() first).
    attach(app: Application, width: number, height: number) {
        if (this.app === app) return; // already attached to this exact app
        this.app = app;
        this.stage = new Container();
        this.screen = new Sprite();
        this.stage.addChild(this.screen);
        app.stage.addChild(this.stage);
        this.width = width;
        this.height = height;
    }

    get ready(): boolean {
        return this.app !== null;
    }

    setRenderScale(scale: number) {
        this.renderScale = Math.max(0.25, Math.min(1, scale));
        for (const inst of this.instances.values()) {
            inst.target?.destroy(true);
            inst.target = null;
        }
    }

    // Called from PixiSurface's onResize - the Application's own canvas
    // resize is handled there; this just needs to know the new size so
    // node targets get reallocated at the right resolution.
    resize(width: number, height: number) {
        this.width = width;
        this.height = height;
        for (const inst of this.instances.values()) {
            inst.target?.destroy(true);
            inst.target = null;
        }
    }

    sync(patch: Patch) {
        this.patch = patch;
        const seen = new Set<string>();

        for (const node of patch.nodes) {
            seen.add(node.id);
            const existing = this.instances.get(node.id);
            if (existing && existing.type === node.type) continue; // untouched

            if (existing) {
                existing.runtime.dispose?.();
                existing.target?.destroy(true);
                this.instances.delete(node.id);
            }

            const def = getNodeDef(node.type);
            if (!def) {
                console.warn(`[engine] unknown node type "${node.type}"`);
                continue;
            }
            this.instances.set(node.id, {
                id: node.id,
                type: node.type,
                runtime: def.createRuntime(),
                target: null
            });
        }

        for (const [id, inst] of [...this.instances]) {
            if (seen.has(id)) continue;
            inst.runtime.dispose?.();
            inst.target?.destroy(true);
            this.instances.delete(id);
        }

        this.compiled = compileGraph(patch);
        this.stats.nodeCount = patch.nodes.length;
        this.stats.cycleCount = this.compiled.cycleNodes.length;
    }

    frame(data: VisualizerData, dt: number) {
        if (!this.app || !this.screen || isContextLost()) return;
        const started = performance.now();
        this.time += dt;

        const rw = Math.max(2, Math.round(this.width * this.renderScale));
        const rh = Math.max(2, Math.round(this.height * this.renderScale));

        const values = new Map<string, Record<string, number>>();
        const textures = new Map<string, Texture | null>();
        let passes = 0;

        const cycleSet = new Set(this.compiled.cycleNodes);

        for (const nodeId of this.compiled.order) {
            if (cycleSet.has(nodeId)) continue;
            const inst = this.instances.get(nodeId);
            const patchNode = this.patch.nodes.find((n) => n.id === nodeId);
            if (!inst || !patchNode) continue;
            const def = getNodeDef(patchNode.type);
            if (!def) continue;

            const edges = this.compiled.incoming.get(nodeId) ?? [];
            const inValues: Record<string, number> = {};
            const inTextures: Record<string, Texture | null> = {};

            for (const e of edges) {
                const srcValues = values.get(e.source);
                if (srcValues && e.sourceHandle in srcValues) {
                    inValues[e.targetHandle] = srcValues[e.sourceHandle];
                }
                if (textures.has(e.source)) {
                    inTextures[e.targetHandle] = textures.get(e.source) ?? null;
                }
            }

            const params: Record<string, ParamValue> = { ...patchNode.params };
            for (const key of Object.keys(inValues)) {
                if (isParamPort(key)) params[paramIdFromPort(key)] = inValues[key];
            }

            const self = inst;
            const ctx: FrameContext = {
                app: this.app,
                data,
                dt,
                time: this.time,
                width: rw,
                height: rh,
                acquireTarget: () => {
                    if (!self.target || self.target.width !== rw || self.target.height !== rh) {
                        self.target?.destroy(true);
                        self.target = RenderTexture.create({ width: rw, height: rh, resolution: 1 });
                    }
                    return self.target;
                }
            };

            const args = { values: inValues, params, textures: inTextures, ctx };

            if (inst.runtime.evalValues) {
                values.set(nodeId, inst.runtime.evalValues(args));
            }
            if (inst.runtime.renderTexture) {
                textures.set(nodeId, inst.runtime.renderTexture(args));
                passes++;
            }
        }

        const outId = findOutputNode(this.patch);
        let finalTexture: Texture | null = null;
        if (outId) {
            const edge = (this.compiled.incoming.get(outId) ?? []).find((e) => e.targetHandle === 'image');
            if (edge) finalTexture = textures.get(edge.source) ?? null;
        }

        this.screen.texture = finalTexture ?? Texture.EMPTY;
        if (finalTexture) {
            this.screen.width = this.width;
            this.screen.height = this.height;
        }

        this.app.render();

        this.stats.frameMs = performance.now() - started;
        this.stats.texturePasses = passes;
    }

    // Tears down everything THIS ENGINE created. The shared Application
    // is never touched here - see lib/pixiHost.ts, which owns it for the
    // life of the tab.
    detach() {
        for (const inst of this.instances.values()) {
            inst.runtime.dispose?.();
            inst.target?.destroy(true);
        }
        this.instances.clear();

        if (this.app && this.stage) {
            this.app.stage.removeChild(this.stage);
        }
        this.screen?.destroy();
        this.stage?.destroy();
        this.app = null;
        this.stage = null;
        this.screen = null;
    }
}
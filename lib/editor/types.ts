import type { Application, RenderTexture, Texture } from 'pixi.js';
import type { VisualizerData } from '../types';

// Two wire types. Enforced at connect time in the editor UI so you can't
// plug an image into a number.
export type PortKind = 'value' | 'texture';

export interface PortDef {
    id: string;
    label: string;
    kind: PortKind;
}

export type ParamDef =
    | { id: string; label: string; kind: 'number'; min: number; max: number; step?: number; default: number }
    | { id: string; label: string; kind: 'enum'; options: string[]; default: string }
    | { id: string; label: string; kind: 'boolean'; default: boolean };

export type ParamValue = number | string | boolean;

// What a node's runtime gets handed every frame.
export interface FrameContext {
    app: Application;
    data: VisualizerData;
    dt: number;
    time: number;
    width: number;
    height: number;
    // Acquire this node's own persistent render target. Each texture node
    // owns one, rather than sharing a pool, which avoids a whole class of
    // read-and-write-the-same-texture bugs at the cost of some VRAM (see
    // the render scale control in the editor).
    acquireTarget(): RenderTexture;
}

export interface NodeEvalArgs {
    // Resolved inputs: a connected wire wins over the static param value.
    values: Record<string, number>;
    params: Record<string, ParamValue>;
    textures: Record<string, Texture | null>;
    ctx: FrameContext;
}

export interface NodeRuntime {
    // Control-rate. Return one entry per declared value output.
    evalValues?(args: NodeEvalArgs): Record<string, number>;
    // Texture-rate. Return the texture this node produced.
    renderTexture?(args: NodeEvalArgs): Texture | null;
    dispose?(): void;
}

export interface NodeDefinition {
    type: string;
    label: string;
    category: 'source' | 'signal' | 'generator' | 'effect' | 'composite' | 'output';
    description?: string;
    inputs?: PortDef[];
    outputs?: PortDef[];
    params?: ParamDef[];
    createRuntime(): NodeRuntime;
}

// ---- serialised patch format ----------------------------------------

export interface PatchNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    params: Record<string, ParamValue>;
}

export interface PatchEdge {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
}

export interface Patch {
    version: 1;
    nodes: PatchNode[];
    edges: PatchEdge[];
}
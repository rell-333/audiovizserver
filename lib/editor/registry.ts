import type { NodeDefinition, PortDef } from './types';
import { generatedNodes } from './registry.generated';

const byType = new Map<string, NodeDefinition>();
for (const def of generatedNodes) {
    if (byType.has(def.type)) {
        console.warn(`[nodes] duplicate node type "${def.type}" - the later file wins`);
    }
    byType.set(def.type, def);
}

export const allNodeDefs: NodeDefinition[] = [...byType.values()];

export function getNodeDef(type: string): NodeDefinition | undefined {
    return byType.get(type);
}

// Params double as input ports. Doing this in one place means a node
// author never declares the same thing twice, and the editor can always
// tell which handle belongs to which param.
export function paramPortId(paramId: string): string {
    return `p_${paramId}`;
}

export function isParamPort(portId: string): boolean {
    return portId.startsWith('p_');
}

export function paramIdFromPort(portId: string): string {
    return portId.slice(2);
}

// The full input port list for a node: its declared inputs, plus one
// generated port per numeric param.
export function inputPortsFor(def: NodeDefinition): PortDef[] {
    const declared = def.inputs ?? [];
    const fromParams: PortDef[] = (def.params ?? [])
        .filter((p) => p.kind === 'number')
        .map((p) => ({ id: paramPortId(p.id), label: p.label, kind: 'value' as const }));
    return [...declared, ...fromParams];
}

export function outputPortsFor(def: NodeDefinition): PortDef[] {
    return def.outputs ?? [];
}

export function defaultParams(def: NodeDefinition): Record<string, number | string | boolean> {
    const out: Record<string, number | string | boolean> = {};
    for (const p of def.params ?? []) out[p.id] = p.default;
    return out;
}

export const categoryOrder: Array<NodeDefinition['category']> = [
    'source',
    'signal',
    'generator',
    'effect',
    'composite',
    'output'
];
import type { Patch, PatchEdge } from './types';

export interface CompiledGraph {
    order: string[]; // node ids, dependency-first
    incoming: Map<string, PatchEdge[]>; // by target node id
    cycleNodes: string[]; // nodes that couldn't be ordered
}

// Kahn's algorithm. Any node left over at the end is part of a cycle;
// those get reported rather than silently dropped, so the editor can
// mark them and the frame loop can skip them instead of hanging.
export function compileGraph(patch: Patch): CompiledGraph {
    const incoming = new Map<string, PatchEdge[]>();
    const dependents = new Map<string, string[]>();
    const indegree = new Map<string, number>();

    for (const n of patch.nodes) {
        incoming.set(n.id, []);
        dependents.set(n.id, []);
        indegree.set(n.id, 0);
    }

    for (const e of patch.edges) {
        if (!incoming.has(e.target) || !incoming.has(e.source)) continue; // dangling
        incoming.get(e.target)!.push(e);
        dependents.get(e.source)!.push(e.target);
        indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of indegree) if (deg === 0) queue.push(id);

    const order: string[] = [];
    while (queue.length) {
        const id = queue.shift()!;
        order.push(id);
        for (const dep of dependents.get(id) ?? []) {
            const next = (indegree.get(dep) ?? 1) - 1;
            indegree.set(dep, next);
            if (next === 0) queue.push(dep);
        }
    }

    const cycleNodes = patch.nodes.map((n) => n.id).filter((id) => !order.includes(id));

    return { order, incoming, cycleNodes };
}

export function findOutputNode(patch: Patch): string | null {
    const out = patch.nodes.find((n) => n.type === 'output');
    return out ? out.id : null;
}
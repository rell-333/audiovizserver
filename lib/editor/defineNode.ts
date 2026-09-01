import type { NodeDefinition } from './types';

// The whole API for authoring a node.
//
// A node file is self-describing: it declares its ports, its params, and
// a factory for its per-instance runtime, then default-exports the
// result of defineNode(). Drop the file in /nodes and it's picked up
// automatically (see scripts/generate-node-registry.mjs, wired to run
// before dev and build) - no registry edit, no import to remember.
//
// Every param is ALSO an input port, generated automatically. So a
// number param gets a slider in the inspector, but land a wire on its
// handle and the wire takes over. That's what makes patching feel
// direct rather than like filling in a form.
export function defineNode(def: NodeDefinition): NodeDefinition {
    return def;
}

export type { NodeDefinition } from './types';
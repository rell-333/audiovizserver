'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getNodeDef, inputPortsFor, outputPortsFor, isParamPort, paramIdFromPort } from '@/lib/editor/registry';
import { useConnectingKind } from './ConnectingContext';

const CATEGORY_COLOR: Record<string, string> = {
    source: '#3a86ff',
    signal: '#8338ec',
    generator: '#ff006e',
    effect: '#fb5607',
    composite: '#ffbe0b',
    output: '#7CFC9A'
};

// One React Flow node. Handles are generated from the node definition,
// so a new node file gets correct ports with no UI work at all - that
// part hasn't changed.
//
// What HAS changed: every number param used to auto-generate a visible
// input port, which meant a node with a dozen params (most of the
// generators we've built) rendered a dozen near-identical dots down the
// side - no way to tell "worth wiring" from "just a slider" apart, and
// the node became huge. Now a param-derived port only renders if it's
// been explicitly exposed (toggled on in the Inspector) for THIS node
// instance - see node.data.exposedParams. Declared inputs/outputs
// (actual texture/value ports the node itself defines) always show;
// only the auto-generated param ports are gated.
export function PatchNodeView({ data, selected }: NodeProps) {
    const type = (data as { type: string }).type;
    const exposedParams = new Set<string>((data as { exposedParams?: string[] }).exposedParams ?? []);
    const def = getNodeDef(type);
    const connectingKind = useConnectingKind();

    if (!def) {
        return (
            <div className="patchNode patchNode--missing">
                <div className="patchNode__title">Unknown node</div>
                <div className="patchNode__body">{type}</div>
            </div>
        );
    }

    const visibleInputs = inputPortsFor(def).filter(
        (p) => !isParamPort(p.id) || exposedParams.has(paramIdFromPort(p.id))
    );
    const hasExposableParams = (def.params ?? []).some((p) => p.kind === 'number');
    const outputs = outputPortsFor(def);
    const accent = CATEGORY_COLOR[def.category] ?? '#888';

    return (
        <div
            className={`patchNode${selected ? ' is-selected' : ''}${connectingKind ? ' is-connecting-mode' : ''}`}
            style={{ borderColor: selected ? accent : undefined }}
        >
            <div className="patchNode__title">
                <span className="patchNode__dot" style={{ background: accent }} />
                {def.label}
            </div>

            <div className="patchNode__ports">
                <div className="patchNode__col">
                    {visibleInputs.map((p) => (
                        <div className="patchNode__port" key={p.id}>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={p.id}
                                className={`patchHandle patchHandle--${p.kind}${
                                    connectingKind === p.kind ? ' is-compatible' : ''
                                }`}
                            />
                            <span className="patchNode__portLabel">{p.label}</span>
                        </div>
                    ))}
                    {visibleInputs.length === 0 && hasExposableParams && (
                        <div className="patchNode__portEmpty">no exposed inputs</div>
                    )}
                </div>

                <div className="patchNode__col patchNode__col--out">
                    {outputs.map((p) => (
                        <div className="patchNode__port patchNode__port--out" key={p.id}>
                            <span className="patchNode__portLabel">{p.label}</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={p.id}
                                className={`patchHandle patchHandle--${p.kind}${
                                    connectingKind === p.kind ? ' is-compatible' : ''
                                }`}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
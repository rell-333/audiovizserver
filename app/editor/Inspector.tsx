'use client';

import type { Edge } from '@xyflow/react';
import { getNodeDef, paramPortId } from '@/lib/editor/registry';
import type { ParamValue } from '@/lib/editor/types';

interface Props {
    nodeId: string | null;
    nodeType: string | null;
    params: Record<string, ParamValue>;
    exposedParams: string[];
    edges: Edge[];
    onChange(paramId: string, value: ParamValue): void;
    onToggleExpose(paramId: string): void;
    onDelete?(): void;
}

export function Inspector({ nodeId, nodeType, params, exposedParams, edges, onChange, onToggleExpose, onDelete }: Props) {
    if (!nodeId || !nodeType) {
        return (
            <div className="inspector">
                <div className="inspector__empty">Select a node to edit its parameters.</div>
            </div>
        );
    }

    const def = getNodeDef(nodeType);
    if (!def) return <div className="inspector">Unknown node type: {nodeType}</div>;

    // A param whose handle has a wire on it is driven by that wire, so the
    // control is shown but disabled rather than hidden - you can still see
    // the last static value, and it's obvious why it isn't editable.
    const driven = new Set(
        edges
            .filter((e) => e.target === nodeId && typeof e.targetHandle === 'string')
            .map((e) => e.targetHandle as string)
    );
    const exposedSet = new Set(exposedParams);

    return (
        <div className="inspector">
            <div className="inspector__header">
                <div>
                    <div className="inspector__title">{def.label}</div>
                    {def.description && <div className="inspector__desc">{def.description}</div>}
                </div>
                {onDelete && (
                    <button className="inspector__delete" onClick={onDelete} title="Delete node">
                        delete
                    </button>
                )}
            </div>

            {(def.params ?? []).length === 0 && (
                <div className="inspector__empty">This node has no parameters.</div>
            )}

            {(def.params ?? []).map((p) => {
                const isDriven = driven.has(paramPortId(p.id));
                const isExposed = exposedSet.has(p.id);
                const value = params[p.id] ?? p.default;

                return (
                    <div className={`param${isDriven ? ' is-driven' : ''}`} key={p.id}>
                        <label className="param__label">
                            <span className="param__labelText">
                                {p.label}
                                {isDriven && <span className="param__badge">wired</span>}
                            </span>
                            {p.kind === 'number' && (
                                <button
                                    className={`param__expose${isExposed ? ' is-on' : ''}`}
                                    onClick={() => onToggleExpose(p.id)}
                                    title={
                                        isExposed
                                            ? isDriven
                                                ? 'Hide this port (this will disconnect its current wire)'
                                                : 'Hide this input port on the node'
                                            : 'Expose this as a wireable input port'
                                    }
                                >
                                    {isExposed ? '● port' : '○ expose'}
                                </button>
                            )}
                        </label>

                        {p.kind === 'number' && (
                            <div className="param__row">
                                <input
                                    type="range"
                                    min={p.min}
                                    max={p.max}
                                    step={p.step ?? 0.01}
                                    value={Number(value)}
                                    disabled={isDriven}
                                    onChange={(e) => onChange(p.id, parseFloat(e.target.value))}
                                />
                                <input
                                    className="param__num"
                                    type="number"
                                    min={p.min}
                                    max={p.max}
                                    step={p.step ?? 0.01}
                                    value={Number(value)}
                                    disabled={isDriven}
                                    onChange={(e) => onChange(p.id, parseFloat(e.target.value))}
                                />
                            </div>
                        )}

                        {p.kind === 'enum' && (
                            <select
                                value={String(value)}
                                disabled={isDriven}
                                onChange={(e) => onChange(p.id, e.target.value)}
                            >
                                {p.options.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        )}

                        {p.kind === 'boolean' && (
                            <input
                                type="checkbox"
                                checked={Boolean(value)}
                                disabled={isDriven}
                                onChange={(e) => onChange(p.id, e.target.checked)}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

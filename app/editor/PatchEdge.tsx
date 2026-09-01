'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';

// A plain edge plus a small x button at its midpoint. Selecting an edge
// and pressing Backspace still works (see deleteKeyCode on the ReactFlow
// element), but that only helps once you've successfully clicked the
// thin path - this gives a second, more forgiving way to remove a wire.
export function PatchEdge({
                              id,
                              sourceX,
                              sourceY,
                              targetX,
                              targetY,
                              sourcePosition,
                              targetPosition,
                              style,
                              markerEnd,
                              selected
                          }: EdgeProps) {
    const { deleteElements } = useReactFlow();
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition
    });

    return (
        <>
            <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
            <EdgeLabelRenderer>
                <button
                    className={`patchEdge__delete${selected ? ' is-selected' : ''}`}
                    style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteElements({ edges: [{ id }] });
                    }}
                    title="Delete connection"
                >
                    ×
                </button>
            </EdgeLabelRenderer>
        </>
    );
}
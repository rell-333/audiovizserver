'use client';

import { createContext, useContext } from 'react';

export type PortKind = 'value' | 'texture';

// While a wire is being dragged, every node needs to know what kind of
// port would complete it, so compatible handles can glow and
// incompatible ones can fade - without threading that through every
// node's own data (which would mix transient drag state into the same
// object that gets serialized into the patch). A plain context is the
// simplest way to broadcast one piece of ephemeral UI state to every
// node at once.
const ConnectingKindContext = createContext<PortKind | null>(null);

export const ConnectingKindProvider = ConnectingKindContext.Provider;

export function useConnectingKind(): PortKind | null {
    return useContext(ConnectingKindContext);
}

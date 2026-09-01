import type { Patch } from './editor/types';
import type { VisualizerData } from './types';

// Live link between the /editor tab and any open /output window(s).
// BroadcastChannel is same-origin, same-browser only and effectively
// instant - there's no server involved, so this only ever works between
// tabs/windows of the same browser on the same machine. That's exactly
// the use case: editor on your screen, output window dragged to a
// second monitor or projector.
//
// Two message kinds, sent at very different rates:
// - 'patch' fires only when the graph actually changes (edits are rare
//   relative to frame rate), so /output can re-sync its own engine
//   immediately rather than waiting on a timer.
// - 'data' fires every rendered frame - it's the live audio analysis,
//   whichever source is actually driving the editor tab right now
//   (websocket feed or local file), so /output never needs its own
//   opinion about audio source at all. It just renders whatever it's
//   handed.
export type SyncMessage = { kind: 'patch'; patch: Patch } | { kind: 'data'; data: VisualizerData };

const CHANNEL_NAME = 'audioviz-output-sync';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
    if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
    return channel;
}

export function broadcastPatch(patch: Patch): void {
    getChannel()?.postMessage({ kind: 'patch', patch } satisfies SyncMessage);
}

export function broadcastData(data: VisualizerData): void {
    getChannel()?.postMessage({ kind: 'data', data } satisfies SyncMessage);
}

// Returns an unsubscribe function. Safe to call even where
// BroadcastChannel doesn't exist (very old browsers) - it just never
// fires and the caller gets a no-op cleanup back.
export function subscribeSync(onMessage: (msg: SyncMessage) => void): () => void {
    const ch = getChannel();
    if (!ch) return () => {};
    const handler = (e: MessageEvent<SyncMessage>) => onMessage(e.data);
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
}

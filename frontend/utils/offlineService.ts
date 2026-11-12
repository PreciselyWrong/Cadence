import { postToSw } from './swUtils';

// The page's side of the offline web UI (docs/fork/WEB-OFFLINE.md): the
// service worker knows whether the server is reachable and what waits in its
// outbox; the page asks it to try again when the network may be back.

export interface RejectedWrite {
    id: number;
    method: string;
    url: string;
    status: number;
    error: string | null;
    entity: string | null;
    name: string | null;
}

export interface OfflineState {
    offline: boolean;
    pending: number;
    rejected: RejectedWrite[];
}

export interface SyncResult {
    applied: number;
    rejected: number;
    stopped: 'offline' | 'auth' | 'busy' | 'error' | null;
}

// While offline (or with writes waiting) the page asks the worker to try
// the server again this often.
const PROBE_INTERVAL_MS = 15000;

let current: OfflineState | null = null;
const stateListeners = new Set<(state: OfflineState) => void>();
const syncListeners = new Set<(result: SyncResult) => void>();
let started = false;

const hasWorker = () =>
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

function onMessage(event: MessageEvent) {
    const data = event.data;
    if (data?.type === 'OFFLINE_STATE') {
        current = {
            offline: !!data.offline,
            pending: data.pending ?? 0,
            rejected: data.rejected ?? [],
        };
        stateListeners.forEach((listener) => listener(current!));
    } else if (data?.type === 'SYNC_COMPLETE') {
        const result: SyncResult = {
            applied: data.applied ?? 0,
            rejected: data.rejected ?? 0,
            stopped: data.stopped ?? null,
        };
        syncListeners.forEach((listener) => listener(result));
    }
}

const needsProbe = () => !!current && (current.offline || current.pending > 0);

export function retryOfflineNow(): void {
    postToSw({ type: 'PROBE' });
}

export function dismissRejectedWrites(): void {
    postToSw({ type: 'DISMISS_REJECTED' });
}

export function startOfflineSync(): void {
    if (started || !hasWorker()) return;
    started = true;
    navigator.serviceWorker.addEventListener('message', onMessage);
    postToSw({ type: 'GET_STATE' });
    // Keeps the cache and outbox from being evicted when space runs low.
    navigator.storage?.persist?.().catch(() => undefined);

    window.addEventListener('online', retryOfflineNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && needsProbe()) {
            retryOfflineNow();
        }
    });
    window.setInterval(() => {
        if (needsProbe()) retryOfflineNow();
    }, PROBE_INTERVAL_MS);
}

export function subscribeOfflineState(
    listener: (state: OfflineState) => void
): () => void {
    stateListeners.add(listener);
    if (current) listener(current);
    return () => stateListeners.delete(listener);
}

export function subscribeSyncComplete(
    listener: (result: SyncResult) => void
): () => void {
    syncListeners.add(listener);
    return () => syncListeners.delete(listener);
}

// The worker's latest state, asked for afresh; null without a worker.
export function requestOfflineState(): Promise<OfflineState | null> {
    if (!hasWorker()) return Promise.resolve(null);
    startOfflineSync();
    return new Promise((resolve) => {
        const answer = (state: OfflineState) => {
            window.clearTimeout(timer);
            stateListeners.delete(answer);
            resolve(state);
        };
        const timer = window.setTimeout(() => {
            stateListeners.delete(answer);
            resolve(current);
        }, 2000);
        stateListeners.add(answer);
        postToSw({ type: 'GET_STATE' });
    });
}

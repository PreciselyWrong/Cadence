import {
    handleAuthResponse,
    getDefaultHeaders,
    getPostHeadersWithCsrf,
} from './authUtils';
import { getApiPath } from '../config/paths';

export interface SyncDevice {
    id: number;
    name: string;
    last_used_at: string;
}

// `label` names the row(s) a reference or a tag list points at.
export interface SyncConflictSide {
    value: unknown;
    label?: string;
}

export interface SyncConflict {
    id: number;
    entity: string;
    uid: string;
    field: string;
    name: string | null;
    created_at: string;
    lost: SyncConflictSide;
    current: SyncConflictSide;
    can_keep_lost: boolean;
}

export interface SyncStatus {
    devices: SyncDevice[];
    last_change_at: string | null;
    conflicts: SyncConflict[];
}

export const fetchSyncStatus = async (): Promise<SyncStatus> => {
    const response = await fetch(getApiPath('sync/status'), {
        credentials: 'include',
        headers: getDefaultHeaders(),
    });
    await handleAuthResponse(response, 'Failed to load the sync status.');
    return response.json();
};

export const resolveSyncConflict = async (
    id: number,
    keep: 'lost' | 'current'
): Promise<void> => {
    const response = await fetch(
        getApiPath(`sync/conflicts/${encodeURIComponent(String(id))}/resolve`),
        {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify({ keep }),
        }
    );
    await handleAuthResponse(response, 'Could not settle that conflict.');
};

// Changes made in this browser while offline wait in the service worker's
// queue (public/sw.js) until the network returns. Null when the browser
// cannot tell.
export const countPendingWebChanges = (): Promise<number | null> =>
    new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open('tududi-offline', 1);
        } catch {
            return resolve(null);
        }
        request.onupgradeneeded = () => {
            request.result.createObjectStore('tududi-sync-queue', {
                keyPath: 'id',
                autoIncrement: true,
            });
        };
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
            const db = request.result;
            try {
                const count = db
                    .transaction('tududi-sync-queue', 'readonly')
                    .objectStore('tududi-sync-queue')
                    .count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    resolve(null);
                };
            } catch {
                db.close();
                resolve(null);
            }
        };
    });

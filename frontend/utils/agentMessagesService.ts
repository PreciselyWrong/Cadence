import { getApiPath } from '../config/paths';
import { fetchWithCsrf } from './csrfService';

// Unread messages that plugins (Hermes agents) sent as notifications:
// the source of the "unread agent message" banner (docs/46-plugins.md).

export interface AgentNotification {
    uid: string;
    title: string;
    message: string | null;
    created_at: string;
    data: { pluginId?: string; openPath?: string; agent?: string } | null;
}

// A path inside Cadence only: never an address or a protocol-relative URL.
export function safeOpenPath(path: unknown): string | null {
    if (typeof path !== 'string') return null;
    if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/.test(path)) return null;
    if (path.startsWith('//')) return null;
    return path;
}

// Newest first, plugin notifications only.
export function pickAgentMessages(list: unknown): AgentNotification[] {
    if (!Array.isArray(list)) return [];
    return list
        .filter(
            (n): n is AgentNotification =>
                !!n &&
                typeof n === 'object' &&
                typeof (n as AgentNotification).uid === 'string' &&
                typeof (n as AgentNotification).title === 'string' &&
                typeof (n as AgentNotification).data?.pluginId === 'string'
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function fetchUnreadAgentMessages(): Promise<AgentNotification[]> {
    const response = await fetch(
        getApiPath('notifications?includeRead=false&limit=20'),
        { credentials: 'include', headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return [];
    const body = await response.json();
    return pickAgentMessages(body?.notifications);
}

export async function markAgentMessageRead(uid: string): Promise<void> {
    await fetchWithCsrf(
        getApiPath(`notifications/${encodeURIComponent(uid)}/read`),
        { method: 'POST', credentials: 'include' }
    );
}

// Calls `onEvent` for each live notification; reconnects on its own
// (EventSource). Returns a function that closes the stream.
export function watchNotificationStream(onEvent: () => void): () => void {
    if (typeof window === 'undefined' || !('EventSource' in window)) {
        return () => {};
    }
    const source = new EventSource(getApiPath('notifications/stream'), {
        withCredentials: true,
    });
    source.addEventListener('notification', onEvent);
    return () => source.close();
}

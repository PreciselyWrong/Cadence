'use strict';

// In-process hub for the live notification stream (GET /notifications/stream).
// A notification is handed over once it is released: right away, or when quiet
// hours end. Only the channels a live client reads (the desktop app and the
// phone) matter here; the rest is delivered by the server itself.

const LIVE_SOURCES = ['desktop', 'mobile'];

const listeners = new Map(); // userId -> Set<fn>

function serialize(notification) {
    return {
        uid: notification.uid,
        type: notification.type,
        title: notification.title,
        message: notification.message ?? null,
        data: notification.data ?? null,
        level: notification.level,
        sources: notification.sources,
        created_at: notification.created_at,
    };
}

function subscribe(userId, listener) {
    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId).add(listener);
    return () => {
        const set = listeners.get(userId);
        if (!set) return;
        set.delete(listener);
        if (set.size === 0) listeners.delete(userId);
    };
}

function publish(notification) {
    const set = listeners.get(notification.user_id);
    if (!set || set.size === 0) return;
    if (!(notification.sources || []).some((s) => LIVE_SOURCES.includes(s))) {
        return;
    }
    const payload = serialize(notification);
    for (const listener of [...set]) {
        try {
            listener(payload);
        } catch {
            // A broken client must not stop the others.
        }
    }
}

module.exports = { subscribe, publish, serialize, LIVE_SOURCES };

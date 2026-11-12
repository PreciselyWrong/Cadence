'use strict';

// In-process hub for the live notification stream (GET /notifications/stream).
// A notification is handed over once it is released: right away, or when quiet
// hours end. Only the channels a live client reads (the desktop app and the
// phone) matter here; the rest is delivered by the server itself.

const LIVE_SOURCES = ['desktop', 'mobile'];

const listeners = new Map(); // userId -> Set<{ onNotification, onRead }>
// Called when the person (not the plugin that sent it) reads, dismisses or
// marks all read: plugins mark their own copy read (docs/46-plugins.md).
const readHooks = new Set();

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

function subscribe(userId, onNotification, onRead = () => {}) {
    const listener = { onNotification, onRead };
    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId).add(listener);
    return () => {
        const set = listeners.get(userId);
        if (!set) return;
        set.delete(listener);
        if (set.size === 0) listeners.delete(userId);
    };
}

function onUserRead(hook) {
    readHooks.add(hook);
    return () => readHooks.delete(hook);
}

// Notifications that stopped being unread: live clients take them off the
// screen; with byUser, the read hooks run too.
function publishRead(userId, notifications, { byUser = true } = {}) {
    const list = notifications.filter(Boolean);
    if (list.length === 0) return;
    const event = { uids: list.map((n) => n.uid) };
    for (const listener of [...(listeners.get(userId) || [])]) {
        try {
            listener.onRead(event);
        } catch {
            // A broken client must not stop the others.
        }
    }
    if (!byUser) return;
    for (const hook of [...readHooks]) {
        for (const notification of list) {
            Promise.resolve()
                .then(() => hook(notification))
                .catch(() => {});
        }
    }
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
            listener.onNotification(payload);
        } catch {
            // A broken client must not stop the others.
        }
    }
}

module.exports = {
    subscribe,
    publish,
    publishRead,
    onUserRead,
    serialize,
    LIVE_SOURCES,
};

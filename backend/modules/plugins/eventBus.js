'use strict';

// Where the webhook dispatcher hands every event to plugins
// (docs/46-plugins.md). Nothing in here knows about plugins: a listener is
// any function, and one that throws cannot reach the code that published.

const listeners = new Set();

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function publish(event) {
    for (const listener of listeners) {
        try {
            listener(event);
        } catch {
            // The listener reports its own failures.
        }
    }
}

function clear() {
    listeners.clear();
}

module.exports = { subscribe, publish, clear };

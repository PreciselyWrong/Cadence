'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// Carries the pushed op_id down to the model hooks, so the journal entry a
// device's own write produces names that op and the device can skip it.
// A write the web UI made offline and replays later also carries when it
// was made (`clock`) and, for a create, the uid the browser chose.
const storage = new AsyncLocalStorage();

module.exports = {
    runWithOp: (opId, fn) => storage.run({ opId }, fn),
    runWithOfflineWrite: ({ opId, clock, createUid }, fn) =>
        storage.run({ opId, offline: { clock, createUid } }, fn),
    currentOpId: () => storage.getStore()?.opId ?? null,
    currentOfflineWrite: () => storage.getStore()?.offline ?? null,
    // The uid the browser chose for the row this replayed create makes, once:
    // later rows of the same request (subtasks, tags) get their own.
    takeCreateUid: (entity) => {
        const wanted = storage.getStore()?.offline?.createUid;
        if (!wanted || wanted.used || wanted.entity !== entity) return null;
        wanted.used = true;
        return wanted.uid;
    },
};

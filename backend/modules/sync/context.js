'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// Carries the pushed op_id down to the model hooks, so the journal entry a
// device's own write produces names that op and the device can skip it.
const storage = new AsyncLocalStorage();

module.exports = {
    runWithOp: (opId, fn) => storage.run({ opId }, fn),
    currentOpId: () => storage.getStore()?.opId ?? null,
};

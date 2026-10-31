'use strict';

// Pushed ops on the same row run one after the other within this process.
// A push reads the row, merges the fields and writes it back across several
// awaits; two pushes interleaved there would each write a merge built on a
// stale read and drop the other's field. Other processes are kept out by the
// row lock of db-dialect.withRowLock (PostgreSQL).
const tails = new Map();

async function runExclusive(key, fn) {
    if (key === null) return fn();

    const previous = tails.get(key) ?? Promise.resolve();
    let release;
    const turn = new Promise((resolve) => {
        release = resolve;
    });
    const tail = previous.then(() => turn);
    tails.set(key, tail);

    await previous;
    try {
        return await fn();
    } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
    }
}

module.exports = { runExclusive };

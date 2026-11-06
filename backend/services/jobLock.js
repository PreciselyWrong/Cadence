const crypto = require('crypto');
const { sequelize } = require('../models');
const { isPostgres } = require('../utils/db-dialect');
const { logError, logInfo } = require('./logService');

// Background jobs (task summaries, due-task notifications, CalDAV sync,
// Telegram polling) used to run in every process. With two app containers
// that means duplicate notifications and stolen Telegram updates. On
// PostgreSQL an advisory lock makes exactly one process run each job; on
// SQLite there is only ever one process, so a local mutex is enough.

// Stable 32-bit key for pg advisory locks, derived from the job name.
const lockKey = (name) =>
    crypto.createHash('sha256').update(name).digest().readInt32BE(0);

const runningLocally = new Set();

// An advisory lock lives on a connection of its own, outside the pool. Held
// on a pool connection, every running job would take one while its queries
// wait for another: with as many jobs as connections, nobody gets any. The
// session owns the lock, so it also goes away if the process dies mid-job.
async function acquireLock(name) {
    const manager = sequelize.connectionManager;
    const connection = await manager.connect(sequelize.config);
    try {
        const { rows } = await connection.query(
            'SELECT pg_try_advisory_lock($1) AS locked',
            [lockKey(name)]
        );
        if (rows[0].locked) return connection;
    } catch (error) {
        await releaseLock(connection);
        throw error;
    }
    await releaseLock(connection);
    return null;
}

// Closing the session releases its lock.
async function releaseLock(connection) {
    try {
        await sequelize.connectionManager.disconnect(connection);
    } catch (error) {
        logError('Failed to close a job lock connection:', error);
    }
}

// Runs `fn` if no other process (or this one) is already running the job
// named `name`. Returns { ran: true, result } or { ran: false }.
async function withJobLock(name, fn) {
    if (runningLocally.has(name)) {
        return { ran: false };
    }

    if (!isPostgres()) {
        runningLocally.add(name);
        try {
            return { ran: true, result: await fn() };
        } finally {
            runningLocally.delete(name);
        }
    }

    const connection = await acquireLock(name);
    if (!connection) {
        return { ran: false };
    }

    runningLocally.add(name);
    try {
        return { ran: true, result: await fn() };
    } finally {
        runningLocally.delete(name);
        await releaseLock(connection);
    }
}

// Long-lived leadership for jobs that must not switch processes between
// runs (the Telegram poller keeps per-bot update offsets in memory). The
// lock is held by its own connection for as long as the process lives.
const leaderConnections = new Map();

// `onLost` runs if the session goes away (database restart, dropped
// connection): the lock went with it, and another process may hold it already.
async function tryBecomeLeader(name, { onLost } = {}) {
    if (leaderConnections.has(name)) {
        return true;
    }

    if (!isPostgres()) {
        leaderConnections.set(name, null);
        return true;
    }

    try {
        const connection = await acquireLock(name);
        if (!connection) {
            return false;
        }
        leaderConnections.set(name, connection);
        connection.once('end', () => {
            if (leaderConnections.get(name) !== connection) return;
            leaderConnections.delete(name);
            logError(`Lost the leader lock for "${name}"`);
            onLost?.();
        });
        logInfo(`This process is now the leader for "${name}"`);
        return true;
    } catch (error) {
        logError(`Failed to acquire leader lock for "${name}":`, error);
        return false;
    }
}

async function releaseLeadership(name) {
    const connection = leaderConnections.get(name);
    leaderConnections.delete(name);
    if (connection) {
        await releaseLock(connection);
    }
}

function isLeader(name) {
    return leaderConnections.has(name);
}

module.exports = {
    withJobLock,
    tryBecomeLeader,
    releaseLeadership,
    isLeader,
    _lockKey: lockKey,
};

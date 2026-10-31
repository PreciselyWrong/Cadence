'use strict';

const { Op, Transaction } = require('sequelize');
const { getDialect } = require('../config/db');

// The one place application code is allowed to branch on the database engine.

function isPostgres() {
    return getDialect() === 'postgres';
}

function isSqlite() {
    return getDialect() === 'sqlite';
}

// Case-insensitive LIKE. SQLite's LIKE already ignores ASCII case;
// PostgreSQL needs ILIKE for the same behaviour.
function ciLike(pattern) {
    return isPostgres() ? { [Op.iLike]: pattern } : { [Op.like]: pattern };
}

// Runs `fn` with SQLite foreign key enforcement switched off. On PostgreSQL
// constraints cannot be toggled per connection, so `fn` just runs as-is and
// the caller must delete rows in dependency order (which every current
// caller already does).
async function withForeignKeyChecksDisabled(sequelize, fn, options = {}) {
    if (!isSqlite()) {
        return fn();
    }

    const queryOptions = options.transaction
        ? { transaction: options.transaction }
        : undefined;

    await sequelize.query('PRAGMA foreign_keys = OFF', queryOptions);
    try {
        return await fn();
    } finally {
        await sequelize.query('PRAGMA foreign_keys = ON', queryOptions);
    }
}

// Empties the given tables. Intended for tests and seed scripts.
// On PostgreSQL the rows are deleted with constraints enforced, so pass the
// tables children first (join tables before tasks, tasks before users, ...).
// DELETE is used rather than TRUNCATE because TRUNCATE takes exclusive locks
// and is far slower on many small tables.
async function truncateTables(sequelize, tableNames) {
    if (tableNames.length === 0) return;

    if (isPostgres()) {
        for (const tableName of tableNames) {
            await sequelize.query(`DELETE FROM "${tableName}"`);
        }
        return;
    }

    await withForeignKeyChecksDisabled(sequelize, async () => {
        for (const tableName of tableNames) {
            await sequelize.query(`DELETE FROM ${tableName}`);
        }
    });
}

// Advisory lock key space of the sync journal; the second key is the user.
const JOURNAL_LOCK_SPACE = 0x53594e43;

// The sync journal cursor is the row id, so ids must become visible in the
// order they were handed out: a pull that already returned id 11 never looks
// below it again. SQLite has one writer at a time, which gives that order. On
// PostgreSQL a transaction that took id 10 can commit after one that took
// id 11, so each insert first takes a per-user lock held until its
// transaction commits: the next id of that user is handed out only once the
// previous holder is visible. A lone insert gets its own short transaction;
// its lock_timeout turns a wait on a caller's own open transaction (a write
// made outside the transaction it runs in) into an error instead of a hang.
async function withJournalOrder(sequelize, userId, transaction, insert) {
    if (!isPostgres()) return insert(transaction);

    const lock = (t) =>
        sequelize.query('SELECT pg_advisory_xact_lock(:space, :userId)', {
            replacements: { space: JOURNAL_LOCK_SPACE, userId },
            transaction: t,
        });
    if (transaction) {
        await lock(transaction);
        return insert(transaction);
    }
    return sequelize.transaction(async (t) => {
        await sequelize.query("SET LOCAL lock_timeout = '10s'", {
            transaction: t,
        });
        await lock(t);
        return insert(t);
    });
}

// Read-merge-write of one row, serialized across processes. On PostgreSQL
// `fn` runs in a transaction and reads the row with `lock` (FOR NO KEY
// UPDATE: writers of the row wait, while inserts that reference it, such as
// task events, do not). SQLite gets no transaction: its single write lock
// would block every write `fn` makes outside it, and one process serializes
// the row in memory instead.
async function withRowLock(sequelize, fn) {
    if (!isPostgres()) return fn({ transaction: null, lock: null });
    return sequelize.transaction((transaction) =>
        fn({ transaction, lock: Transaction.LOCK.NO_KEY_UPDATE })
    );
}

module.exports = {
    JOURNAL_LOCK_SPACE,
    withJournalOrder,
    withRowLock,
    isPostgres,
    isSqlite,
    ciLike,
    withForeignKeyChecksDisabled,
    truncateTables,
};

'use strict';

const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');
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

// Advisory lock key space of the sync row creations.
const ROW_CREATE_LOCK_SPACE = 0x43524554;

// A row that does not exist yet has nothing to lock, so two processes that
// create the same one would both insert (or fail) blind. Creators take this
// transaction-scoped lock on the row's key first: the second waits for the
// first to commit and then reads its row. No-op on SQLite, whose single
// writer and in-process mutex already serialize them. Returns whether it
// locked, i.e. whether the row has to be read again.
async function lockNewRow(sequelize, transaction, key) {
    if (!isPostgres() || !transaction) return false;
    const hashed = crypto.createHash('sha256').update(key).digest();
    await sequelize.query('SELECT pg_advisory_xact_lock(:space, :key)', {
        replacements: {
            space: ROW_CREATE_LOCK_SPACE,
            key: hashed.readInt32BE(0),
        },
        transaction,
    });
    return true;
}

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

// Sets the DEFAULT of a nullable JSON column to `value`, for migrations.
// PostgreSQL alters the default in place. SQLite cannot, and rebuilding a
// wide table would lose its indexes and keys, so the column is replaced
// (add with the new default, copy, drop, rename) in one transaction. Only the
// DEFAULT changes; stored values are kept.
async function setJsonColumnDefault(queryInterface, table, column, value) {
    const sequelize = queryInterface.sequelize;
    const literal = sequelize.escape(JSON.stringify(value));

    if (sequelize.getDialect() === 'postgres') {
        await sequelize.query(
            `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT ${literal}`
        );
        return;
    }

    const current = (await queryInterface.describeTable(table))[column];
    if (!current) return;
    try {
        const stored = JSON.parse(
            String(current.defaultValue)
                .replace(/^'|'$/g, '')
                .replace(/''/g, "'")
        );
        if (isDeepStrictEqual(stored, value)) return;
    } catch {
        // No default, or one that is not JSON: replace it.
    }

    const temporary = `${column}_new`;
    await sequelize.transaction(async (transaction) => {
        const run = (sql) => sequelize.query(sql, { transaction });
        await run(
            `ALTER TABLE \`${table}\` ADD COLUMN \`${temporary}\` JSON DEFAULT ${literal}`
        );
        await run(`UPDATE \`${table}\` SET \`${temporary}\` = \`${column}\``);
        await run(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
        await run(
            `ALTER TABLE \`${table}\` RENAME COLUMN \`${temporary}\` TO \`${column}\``
        );
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
    lockNewRow,
    setJsonColumnDefault,
    isPostgres,
    isSqlite,
    ciLike,
    withForeignKeyChecksDisabled,
    truncateTables,
};

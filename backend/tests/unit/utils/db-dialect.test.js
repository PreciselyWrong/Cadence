const { Op } = require('sequelize');

// The global test setup already loads utils/db-dialect against the real
// config, so each case loads a fresh copy bound to a mocked dialect.
function loadWithDialect(dialect) {
    let helpers;
    jest.isolateModules(() => {
        jest.doMock('../../../config/db', () => ({
            getDialect: () => dialect,
        }));
        helpers = require('../../../utils/db-dialect');
    });
    return helpers;
}

describe('db-dialect', () => {
    describe('on sqlite', () => {
        const helpers = loadWithDialect('sqlite');

        it('reports the dialect', () => {
            expect(helpers.isSqlite()).toBe(true);
            expect(helpers.isPostgres()).toBe(false);
        });

        it('ciLike uses LIKE', () => {
            expect(helpers.ciLike('%x%')).toEqual({ [Op.like]: '%x%' });
        });

        it('withForeignKeyChecksDisabled toggles the pragma around fn', async () => {
            const sequelize = { query: jest.fn().mockResolvedValue([]) };
            const fn = jest.fn().mockResolvedValue('result');

            const result = await helpers.withForeignKeyChecksDisabled(
                sequelize,
                fn
            );

            expect(result).toBe('result');
            expect(sequelize.query.mock.calls.map((c) => c[0])).toEqual([
                'PRAGMA foreign_keys = OFF',
                'PRAGMA foreign_keys = ON',
            ]);
        });

        it('withForeignKeyChecksDisabled re-enables checks when fn throws', async () => {
            const sequelize = { query: jest.fn().mockResolvedValue([]) };
            const fn = jest.fn().mockRejectedValue(new Error('boom'));

            await expect(
                helpers.withForeignKeyChecksDisabled(sequelize, fn, {
                    transaction: 'tx',
                })
            ).rejects.toThrow('boom');
            expect(sequelize.query).toHaveBeenLastCalledWith(
                'PRAGMA foreign_keys = ON',
                { transaction: 'tx' }
            );
        });

        it('truncateTables deletes each table with checks off', async () => {
            const sequelize = { query: jest.fn().mockResolvedValue([]) };

            await helpers.truncateTables(sequelize, ['a', 'b']);

            expect(sequelize.query.mock.calls.map((c) => c[0])).toEqual([
                'PRAGMA foreign_keys = OFF',
                'DELETE FROM a',
                'DELETE FROM b',
                'PRAGMA foreign_keys = ON',
            ]);
        });

        it('withJournalOrder inserts on the caller transaction without locking', async () => {
            const sequelize = { query: jest.fn(), transaction: jest.fn() };
            const insert = jest.fn().mockResolvedValue('row');

            expect(
                await helpers.withJournalOrder(sequelize, 7, 'tx', insert)
            ).toBe('row');
            expect(insert).toHaveBeenCalledWith('tx');
            expect(sequelize.query).not.toHaveBeenCalled();
            expect(sequelize.transaction).not.toHaveBeenCalled();
        });

        it('withRowLock runs fn without a transaction', async () => {
            const sequelize = { transaction: jest.fn() };
            const fn = jest.fn().mockResolvedValue('done');

            expect(await helpers.withRowLock(sequelize, fn)).toBe('done');
            expect(fn).toHaveBeenCalledWith({ transaction: null, lock: null });
            expect(sequelize.transaction).not.toHaveBeenCalled();
        });
    });

    describe('on postgres', () => {
        const helpers = loadWithDialect('postgres');

        it('reports the dialect', () => {
            expect(helpers.isSqlite()).toBe(false);
            expect(helpers.isPostgres()).toBe(true);
        });

        it('ciLike uses ILIKE', () => {
            expect(helpers.ciLike('%x%')).toEqual({ [Op.iLike]: '%x%' });
        });

        it('withForeignKeyChecksDisabled just runs fn', async () => {
            const sequelize = { query: jest.fn() };
            const fn = jest.fn().mockResolvedValue(42);

            expect(
                await helpers.withForeignKeyChecksDisabled(sequelize, fn)
            ).toBe(42);
            expect(sequelize.query).not.toHaveBeenCalled();
        });

        it('truncateTables deletes each table in the given order without pragmas', async () => {
            const sequelize = { query: jest.fn().mockResolvedValue([]) };

            await helpers.truncateTables(sequelize, ['a', 'b']);

            expect(sequelize.query.mock.calls.map((c) => c[0])).toEqual([
                'DELETE FROM "a"',
                'DELETE FROM "b"',
            ]);
        });

        // A journal id must reach readers in commit order, or a pull that
        // saw id 11 would skip id 10 committed after it.
        it('withJournalOrder takes the per-user journal lock in the caller transaction', async () => {
            const sequelize = {
                query: jest.fn().mockResolvedValue([]),
                transaction: jest.fn(),
            };
            const insert = jest.fn().mockResolvedValue('row');

            expect(
                await helpers.withJournalOrder(sequelize, 7, 'tx', insert)
            ).toBe('row');
            expect(sequelize.query).toHaveBeenCalledTimes(1);
            const [sql, options] = sequelize.query.mock.calls[0];
            expect(sql).toBe('SELECT pg_advisory_xact_lock(:space, :userId)');
            expect(options).toEqual({
                replacements: {
                    space: helpers.JOURNAL_LOCK_SPACE,
                    userId: 7,
                },
                transaction: 'tx',
            });
            expect(insert).toHaveBeenCalledWith('tx');
            expect(sequelize.transaction).not.toHaveBeenCalled();
        });

        it('withJournalOrder wraps a lone insert in a short locked transaction', async () => {
            const t = { id: 't1' };
            const order = [];
            const sequelize = {
                query: jest.fn(async (sql) => {
                    order.push(sql);
                    return [];
                }),
                transaction: jest.fn(async (fn) => fn(t)),
            };
            const insert = jest.fn(async (tx) => {
                order.push(`insert:${tx.id}`);
                return 'row';
            });

            expect(
                await helpers.withJournalOrder(sequelize, 7, undefined, insert)
            ).toBe('row');
            expect(order).toEqual([
                "SET LOCAL lock_timeout = '10s'",
                'SELECT pg_advisory_xact_lock(:space, :userId)',
                'insert:t1',
            ]);
            expect(
                sequelize.query.mock.calls.every(
                    ([, options]) => options.transaction === t
                )
            ).toBe(true);
        });

        it('withRowLock runs fn in a transaction that locks the row for update', async () => {
            const t = { id: 't1' };
            const sequelize = { transaction: jest.fn(async (fn) => fn(t)) };
            const fn = jest.fn().mockResolvedValue('done');

            expect(await helpers.withRowLock(sequelize, fn)).toBe('done');
            // NO KEY UPDATE, not UPDATE: it still serializes writers of the
            // row but lets other connections insert rows that reference it.
            expect(fn).toHaveBeenCalledWith({
                transaction: t,
                lock: 'NO KEY UPDATE',
            });
        });

        it('truncateTables is a no-op for an empty list', async () => {
            const sequelize = { query: jest.fn() };
            await helpers.truncateTables(sequelize, []);
            expect(sequelize.query).not.toHaveBeenCalled();
        });
    });
});

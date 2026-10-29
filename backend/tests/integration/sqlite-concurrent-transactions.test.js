const { sequelize, Tag } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { isSqlite } = require('../../utils/db-dialect');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Two requests that each read, then write inside a transaction, at the same
// time. On SQLite a deferred transaction fails with SQLITE_BUSY at the
// write instead of waiting; transactions start IMMEDIATE so they queue.
(isSqlite() ? describe : describe.skip)(
    'SQLite concurrent transactions',
    () => {
        it('lets overlapping read-then-write transactions all commit', async () => {
            const user = await createTestUser({
                email: 'concurrent@example.com',
            });

            const work = (n) =>
                sequelize.transaction(async (transaction) => {
                    await Tag.count({
                        where: { user_id: user.id },
                        transaction,
                    });
                    await sleep(50);
                    await Tag.create(
                        { name: `tag-${n}`, user_id: user.id },
                        { transaction }
                    );
                });

            const before = await Tag.count({ where: { user_id: user.id } });
            const results = await Promise.allSettled([1, 2, 3, 4].map(work));
            const failures = results.filter((r) => r.status === 'rejected');
            expect(failures.map((f) => String(f.reason))).toEqual([]);
            expect(await Tag.count({ where: { user_id: user.id } })).toBe(
                before + 4
            );
        });
    }
);

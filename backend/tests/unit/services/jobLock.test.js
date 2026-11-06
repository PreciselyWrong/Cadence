const {
    withJobLock,
    tryBecomeLeader,
    releaseLeadership,
    isLeader,
    _lockKey,
} = require('../../../services/jobLock');
const { sequelize } = require('../../../models');
const { isPostgres } = require('../../../utils/db-dialect');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('jobLock', () => {
    it('runs the job and returns its result', async () => {
        const res = await withJobLock('unit:simple', async () => 42);
        expect(res).toEqual({ ran: true, result: 42 });
    });

    it('skips a job that is already running under the same name', async () => {
        let concurrent = 0;
        let peak = 0;
        const job = async () => {
            concurrent += 1;
            peak = Math.max(peak, concurrent);
            await sleep(50);
            concurrent -= 1;
            return 'done';
        };

        const [first, second] = await Promise.all([
            withJobLock('unit:overlap', job),
            withJobLock('unit:overlap', job),
        ]);

        expect(peak).toBe(1);
        expect([first.ran, second.ran].sort()).toEqual([false, true]);
    });

    it('lets different job names run at the same time', async () => {
        let concurrent = 0;
        let peak = 0;
        const job = async () => {
            concurrent += 1;
            peak = Math.max(peak, concurrent);
            await sleep(30);
            concurrent -= 1;
        };

        await Promise.all([
            withJobLock('unit:a', job),
            withJobLock('unit:b', job),
        ]);
        expect(peak).toBe(2);
    });

    it('releases the lock when the job throws', async () => {
        await expect(
            withJobLock('unit:throws', async () => {
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        const again = await withJobLock('unit:throws', async () => 'ok');
        expect(again.ran).toBe(true);
    });

    it('hands out leadership once per process and releases it', async () => {
        expect(await tryBecomeLeader('unit:leader')).toBe(true);
        expect(isLeader('unit:leader')).toBe(true);
        expect(await tryBecomeLeader('unit:leader')).toBe(true);

        await releaseLeadership('unit:leader');
        expect(isLeader('unit:leader')).toBe(false);
    });

    it('derives a stable 32-bit key from the job name', () => {
        expect(_lockKey('telegram-poller')).toBe(_lockKey('telegram-poller'));
        expect(_lockKey('a')).not.toBe(_lockKey('b'));
        expect(Number.isInteger(_lockKey('x'))).toBe(true);
        expect(Math.abs(_lockKey('x'))).toBeLessThan(2 ** 31);
    });

    (isPostgres() ? describe : describe.skip)('on PostgreSQL', () => {
        // Asks for the lock the way another app process would.
        const lockFromAnotherProcess = async (name, check) => {
            const manager = sequelize.connectionManager;
            const other = await manager.connect(sequelize.config);
            try {
                const { rows } = await other.query(
                    'SELECT pg_try_advisory_lock($1) AS locked',
                    [_lockKey(name)]
                );
                return check(rows[0].locked);
            } finally {
                await manager.disconnect(other);
            }
        };

        it('leaves the pool to the jobs, even with more jobs than connections', async () => {
            const jobs = sequelize.options.pool.max + 1;
            let started = 0;
            let allStarted;
            const barrier = new Promise((resolve) => {
                allStarted = resolve;
            });

            const results = await Promise.all(
                Array.from({ length: jobs }, (_, index) =>
                    withJobLock(`unit:pool:${index}`, async () => {
                        started += 1;
                        if (started === jobs) allStarted();
                        await barrier;
                        const [[row]] = await sequelize.query('SELECT 1 AS ok');
                        return row.ok;
                    })
                )
            );

            expect(results.map((r) => r.result)).toEqual(Array(jobs).fill(1));
        }, 15000);

        it('keeps another process out while the job runs, and lets it in after', async () => {
            await withJobLock('unit:exclusive', async () => {
                await lockFromAnotherProcess('unit:exclusive', (locked) =>
                    expect(locked).toBe(false)
                );
            });
            await lockFromAnotherProcess('unit:exclusive', (locked) =>
                expect(locked).toBe(true)
            );
        });

        it('does not run a job another process holds', async () => {
            const manager = sequelize.connectionManager;
            const other = await manager.connect(sequelize.config);
            try {
                await other.query('SELECT pg_advisory_lock($1)', [
                    _lockKey('unit:held'),
                ]);
                const job = jest.fn();
                expect(await withJobLock('unit:held', job)).toEqual({
                    ran: false,
                });
                expect(job).not.toHaveBeenCalled();
            } finally {
                await manager.disconnect(other);
            }
        });

        it('holds leadership without taking a pool connection', async () => {
            const pool = sequelize.connectionManager.pool;
            expect(await tryBecomeLeader('unit:leader:pg')).toBe(true);
            expect(pool.using).toBe(0);
            await lockFromAnotherProcess('unit:leader:pg', (locked) =>
                expect(locked).toBe(false)
            );

            await releaseLeadership('unit:leader:pg');
            await lockFromAnotherProcess('unit:leader:pg', (locked) =>
                expect(locked).toBe(true)
            );
        });
    });
});

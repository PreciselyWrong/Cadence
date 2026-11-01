// Several server processes on one PostgreSQL database: the in-process row
// mutex no longer serializes pushes, so the database locks of
// db-dialect.withRowLock and withJournalOrder have to. The mutex is switched
// off here so concurrent pushes reach the database on separate pooled
// connections, as they would from two processes. SQLite has a single writer
// and relies on the mutex instead, so these cases only run on PostgreSQL.

jest.mock('../../modules/sync/rowMutex', () => ({
    runExclusive: (_key, fn) => fn(),
}));

const { Task, SyncChange, sequelize } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const syncService = require('../../modules/sync/service');
const { isPostgres } = require('../../utils/db-dialect');

const describeOnPostgres = isPostgres() ? describe : describe.skip;

const hlc = (ms, counter = 0, node = 'devA') =>
    `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;

const upsert = (opId, uid, fields, clock) => ({
    op_id: opId,
    entity: 'task',
    uid,
    action: 'upsert',
    fields: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, { value: v, hlc: clock }])
    ),
});

const statusOf = (response) => response.results[0].status;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// db-dialect.lockNewRow's advisory key space ('CRET').
const ROW_CREATE_LOCK_SPACE = 0x43524554;
const creationLockHeld = async () => {
    const [rows] = await sequelize.query(
        "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND classid = :space",
        { replacements: { space: ROW_CREATE_LOCK_SPACE } }
    );
    return rows.length > 0;
};

// Task names in the user's journal, in id order (the user's tags, journaled
// by createTestUser, are left out).
const taskJournal = async (userId) =>
    (
        await SyncChange.findAll({
            where: { user_id: userId, entity: 'task' },
            order: [['id', 'ASC']],
        })
    ).map((entry) => entry.data.name);

describeOnPostgres('Offline sync locks across processes (PostgreSQL)', () => {
    let user;

    beforeEach(async () => {
        user = await createTestUser({ email: 'pg-locks@example.com' });
    });

    it('serializes two pushes on the same row through the row lock', async () => {
        await syncService.push(user.id, [
            upsert('pg-base', 'pglocktask0001', { name: 'Base' }, hlc(10)),
        ]);

        const [a, b] = await Promise.all([
            syncService.push(user.id, [
                upsert(
                    'pg-a',
                    'pglocktask0001',
                    { name: 'Renamed' },
                    hlc(20, 0, 'devA')
                ),
            ]),
            syncService.push(user.id, [
                upsert(
                    'pg-b',
                    'pglocktask0001',
                    { note: 'from B' },
                    hlc(21, 0, 'devB')
                ),
            ]),
        ]);

        expect([statusOf(a), statusOf(b)]).toEqual(['applied', 'applied']);
        const task = await Task.findOne({ where: { uid: 'pglocktask0001' } });
        expect(task.name).toBe('Renamed');
        expect(task.note).toBe('from B');
        expect(task.field_clocks).toMatchObject({
            name: hlc(20, 0, 'devA'),
            note: hlc(21, 0, 'devB'),
        });
        const last = await SyncChange.findOne({
            where: { user_id: user.id, uid: 'pglocktask0001' },
            order: [['id', 'DESC']],
        });
        expect(last.data).toMatchObject({ name: 'Renamed', note: 'from B' });
    });

    // Both devices send a valid create, so the loser reaches the unique
    // index (which waits for the winner's commit) and is merged again.
    it('merges a create that lost the race onto the winning row', async () => {
        const name = { value: 'Water plants', hlc: hlc(30, 0, 'devA') };
        const [a, b] = await Promise.all([
            syncService.push(user.id, [
                {
                    op_id: 'pg-new-a',
                    entity: 'task',
                    uid: 'pglocktask0002',
                    action: 'upsert',
                    fields: { name },
                },
            ]),
            syncService.push(user.id, [
                {
                    op_id: 'pg-new-b',
                    entity: 'task',
                    uid: 'pglocktask0002',
                    action: 'upsert',
                    fields: {
                        name,
                        note: { value: 'From B', hlc: hlc(31, 0, 'devB') },
                    },
                },
            ]),
        ]);

        expect([statusOf(a), statusOf(b)]).toEqual(['applied', 'applied']);
        const tasks = await Task.findAll({ where: { uid: 'pglocktask0002' } });
        expect(tasks).toHaveLength(1);
        expect(tasks[0].name).toBe('Water plants');
        expect(tasks[0].note).toBe('From B');
        expect(tasks[0].field_clocks).toMatchObject({
            note: hlc(31, 0, 'devB'),
        });
    });

    // The loser's fields are not a valid task alone (no name), so its create
    // fails validation before the unique index could make it wait: the
    // creation lock makes it wait for the winner and merge into its row.
    // B starts only once A holds that lock (or is done): if B took it first
    // there would be no row to merge into and B would rightly be refused.
    it('merges a create that is not valid alone onto the winning row', async () => {
        const pushA = syncService.push(user.id, [
            upsert(
                'pg-partial-a',
                'pglocktask0003',
                { name: 'From A' },
                hlc(40, 0, 'devA')
            ),
        ]);
        let aDone = false;
        pushA.then(
            () => (aDone = true),
            () => (aDone = true)
        );
        for (let i = 0; i < 200 && !aDone && !(await creationLockHeld()); i++) {
            await wait(5);
        }
        const [a, b] = await Promise.all([
            pushA,
            syncService.push(user.id, [
                upsert(
                    'pg-partial-b',
                    'pglocktask0003',
                    { note: 'From B' },
                    hlc(41, 0, 'devB')
                ),
            ]),
        ]);

        expect([statusOf(a), statusOf(b)]).toEqual(['applied', 'applied']);
        const tasks = await Task.findAll({ where: { uid: 'pglocktask0003' } });
        expect(tasks).toHaveLength(1);
        expect(tasks[0].name).toBe('From A');
        expect(tasks[0].note).toBe('From B');
    });

    // A pull that returned id N never reads below it again, so a later id
    // must not become visible while an earlier one is still uncommitted.
    it('makes journal ids visible in commit order per user', async () => {
        const other = await createTestUser({ email: 'pg-locks-2@example.com' });
        const first = await sequelize.transaction();
        let second;
        try {
            await Task.create(
                { name: 'First', user_id: user.id },
                { transaction: first }
            );

            second = Task.create({ name: 'Second', user_id: user.id });
            // Another user's journal is not held up by this user's lock.
            await Task.create({ name: 'Elsewhere', user_id: other.id });
            await wait(300);

            expect(await taskJournal(user.id)).toEqual([]);
            expect(await taskJournal(other.id)).toEqual(['Elsewhere']);

            await first.commit();
        } catch (error) {
            await first.rollback().catch(() => {});
            throw error;
        }
        await second;

        const names = await taskJournal(user.id);
        expect(names[0]).toBe('First');
        expect(names[names.length - 1]).toBe('Second');
        expect(names.lastIndexOf('First')).toBeLessThan(
            names.indexOf('Second')
        );
    });
});

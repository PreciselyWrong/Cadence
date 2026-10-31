const { Task, SyncChange, RecurringCompletion } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const syncService = require('../../modules/sync/service');
const { applyOccurrence } = require('../../modules/sync/occurrences');

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

const lastJournalEntry = (userId, uid) =>
    SyncChange.findOne({
        where: { user_id: userId, entity: 'task', uid },
        order: [['id', 'DESC']],
    });

// Two devices pushing at the same moment: every push reads, merges and
// writes the row, so without per-row serialization the second write is built
// on a stale read and drops the first one's field clock and journal data.
describe('Offline sync under concurrent pushes', () => {
    let user;

    beforeEach(async () => {
        user = await createTestUser({ email: 'sync-race@example.com' });
    });

    it('keeps both fields when two pushes edit the same row at once', async () => {
        await syncService.push(user.id, [
            upsert(
                'race-base',
                'racetask000001',
                { name: 'Base', note: 'n0' },
                hlc(10)
            ),
        ]);

        const [a, b] = await Promise.all([
            syncService.push(user.id, [
                upsert(
                    'race-a',
                    'racetask000001',
                    { name: 'Renamed' },
                    hlc(20, 0, 'devA')
                ),
            ]),
            syncService.push(user.id, [
                upsert(
                    'race-b',
                    'racetask000001',
                    { note: 'from B' },
                    hlc(21, 0, 'devB')
                ),
            ]),
        ]);

        expect([statusOf(a), statusOf(b)]).toEqual(['applied', 'applied']);
        const task = await Task.findOne({ where: { uid: 'racetask000001' } });
        expect(task.name).toBe('Renamed');
        expect(task.note).toBe('from B');
        expect(task.field_clocks).toMatchObject({
            name: hlc(20, 0, 'devA'),
            note: hlc(21, 0, 'devB'),
        });
        // Devices read the journal, not the table: the last entry must carry
        // both edits too.
        const last = await lastJournalEntry(user.id, 'racetask000001');
        expect(last.data).toMatchObject({ name: 'Renamed', note: 'from B' });
    });

    it('merges two pushes that create the same new row at once', async () => {
        const [a, b] = await Promise.all([
            syncService.push(user.id, [
                upsert(
                    'race-new-a',
                    'racetask000002',
                    { name: 'From A' },
                    hlc(30, 0, 'devA')
                ),
            ]),
            syncService.push(user.id, [
                upsert(
                    'race-new-b',
                    'racetask000002',
                    { note: 'From B' },
                    hlc(31, 0, 'devB')
                ),
            ]),
        ]);

        expect([statusOf(a), statusOf(b)]).toEqual(['applied', 'applied']);
        const tasks = await Task.findAll({ where: { uid: 'racetask000002' } });
        expect(tasks).toHaveLength(1);
        expect(tasks[0].name).toBe('From A');
        expect(tasks[0].note).toBe('From B');
    });

    describe('recurring occurrences', () => {
        const DUE = '2026-11-02T09:00:00.000Z';
        const occurrence = (opId) => ({
            op_id: opId,
            entity: 'task',
            uid: 'racerecur00001',
            action: 'complete_occurrence',
            occurrence_date: DUE,
            hlc: hlc(5, 0, opId),
        });

        beforeEach(async () => {
            await syncService.push(user.id, [
                upsert(
                    'race-recur',
                    'racerecur00001',
                    {
                        name: 'Water plants',
                        recurrence_type: 'daily',
                        recurrence_interval: 1,
                        due_date: DUE,
                    },
                    hlc(1)
                ),
            ]);
        });

        const expectCompletedOnce = async () => {
            const task = await Task.findOne({
                where: { uid: 'racerecur00001' },
            });
            expect(new Date(task.due_date).toISOString()).toBe(
                '2026-11-03T09:00:00.000Z'
            );
            expect(
                await RecurringCompletion.count({ where: { task_id: task.id } })
            ).toBe(1);
        };

        it('completes an occurrence pushed twice at once only once', async () => {
            const results = await Promise.all([
                syncService.push(user.id, [occurrence('occ-dev-a')]),
                syncService.push(user.id, [occurrence('occ-dev-b')]),
            ]);

            expect(results.map(statusOf)).toEqual(['applied', 'applied']);
            await expectCompletedOnce();
        });

        // Two server processes do not share the in-process row lock; the
        // occurrence claim alone has to keep the completion single.
        it('claims an occurrence atomically without the row lock', async () => {
            const results = await Promise.all([
                applyOccurrence(user.id, occurrence('occ-proc-a')),
                applyOccurrence(user.id, occurrence('occ-proc-b')),
            ]);

            expect(results.map((r) => r.status)).toEqual([
                'applied',
                'applied',
            ]);
            expect(results.filter((r) => r.duplicate)).toHaveLength(1);
            await expectCompletedOnce();
        });

        it('releases the claim when the occurrence is refused', async () => {
            const NEXT = '2026-11-03T09:00:00.000Z';
            const early = await applyOccurrence(user.id, {
                ...occurrence('occ-early'),
                occurrence_date: NEXT,
            });
            expect(early).toMatchObject({
                status: 'rejected',
                reason: 'occurrence_not_due',
            });

            await applyOccurrence(user.id, occurrence('occ-first'));
            const next = await applyOccurrence(user.id, {
                ...occurrence('occ-next'),
                occurrence_date: NEXT,
            });

            expect(next).toEqual({ status: 'applied' });
            const task = await Task.findOne({
                where: { uid: 'racerecur00001' },
            });
            expect(new Date(task.due_date).toISOString()).toBe(
                '2026-11-04T09:00:00.000Z'
            );
        });
    });
});

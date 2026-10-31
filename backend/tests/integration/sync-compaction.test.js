const request = require('supertest');
const app = require('../../app');
const { SyncChange, Setting, sequelize } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const {
    compactJournal,
    retentionDays,
} = require('../../modules/sync/compaction');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T12:00:00.000Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

// Journal rows are written directly: compaction only reads the journal, so
// any entity (tasks and the Cadence habit entities alike) goes through it.
async function entry(userId, entity, uid, op, createdAt) {
    const row = await SyncChange.create({
        user_id: userId,
        entity,
        uid,
        op,
        data: op === 'delete' ? { hlc: 'x' } : { uid },
    });
    await sequelize.query(
        'UPDATE sync_changes SET created_at = ? WHERE id = ?',
        {
            replacements: [createdAt, row.id],
        }
    );
    return row.id;
}

const keptIds = async (userId) =>
    (
        await SyncChange.findAll({
            where: { user_id: userId },
            order: [['id', 'ASC']],
            attributes: ['id'],
        })
    ).map((r) => r.id);

describe('Offline sync journal compaction', () => {
    let user;
    let agent;

    beforeEach(async () => {
        await Setting.destroy({ where: {} });
        ({ user, agent } = await signIn('sync-compact@example.com'));
        // Signing up journals the default rows; each case starts empty.
        await SyncChange.destroy({ where: {} });
    });

    it('drops old entries superseded by a later one, for every entity', async () => {
        await entry(user.id, 'task', 'task-0001', 'upsert', daysAgo(40));
        const taskLatest = await entry(
            user.id,
            'task',
            'task-0001',
            'upsert',
            daysAgo(35)
        );
        await entry(
            user.id,
            'habit_entry',
            'entry-0001',
            'upsert',
            daysAgo(50)
        );
        const entryLatest = await entry(
            user.id,
            'habit_entry',
            'entry-0001',
            'upsert',
            daysAgo(2)
        );
        // Superseded but still inside the retention window: kept.
        const recentGoal = await entry(
            user.id,
            'habit_goal',
            'goal-0001',
            'upsert',
            daysAgo(5)
        );
        const goalLatest = await entry(
            user.id,
            'habit_goal',
            'goal-0001',
            'upsert',
            daysAgo(1)
        );

        const result = await compactJournal({ now: NOW });

        expect(result.removed).toBe(2);
        expect(await keptIds(user.id)).toEqual([
            taskLatest,
            entryLatest,
            recentGoal,
            goalLatest,
        ]);
    });

    it('keeps tombstones until the retention ends, then asks older cursors to reset', async () => {
        const created = await entry(
            user.id,
            'habit',
            'habit-0001',
            'upsert',
            daysAgo(60)
        );
        const oldTombstone = await entry(
            user.id,
            'habit',
            'habit-0001',
            'delete',
            daysAgo(45)
        );
        const recentTombstone = await entry(
            user.id,
            'task',
            'task-0002',
            'delete',
            daysAgo(3)
        );
        const live = await entry(
            user.id,
            'area',
            'area-0001',
            'upsert',
            daysAgo(90)
        );

        await compactJournal({ now: NOW });

        expect(await keptIds(user.id)).toEqual(
            [recentTombstone, live].sort((a, b) => a - b)
        );

        // A device that had not pulled the old delete can no longer learn it
        // from the journal: it must take a new snapshot.
        const stale = await agent.get(`/api/v1/sync/pull?cursor=${created}`);
        expect(stale.status).toBe(410);
        expect(stale.body).toMatchObject({ error: 'reset_required' });

        const current = await agent.get(
            `/api/v1/sync/pull?cursor=${oldTombstone}`
        );
        expect(current.status).toBe(200);
        expect(current.body.changes.map((c) => c.seq)).toEqual(
            [recentTombstone, live].filter((id) => id > oldTombstone)
        );
    });

    it('only resets the devices of the user whose tombstones were removed', async () => {
        const { user: other, agent: otherAgent } = await signIn(
            'sync-compact-2@example.com'
        );
        await entry(user.id, 'task', 'task-0003', 'delete', daysAgo(45));
        await entry(other.id, 'task', 'task-0004', 'upsert', daysAgo(45));

        await compactJournal({ now: NOW });

        expect(
            (await otherAgent.get('/api/v1/sync/pull?cursor=0')).status
        ).toBe(200);
        expect((await agent.get('/api/v1/sync/pull?cursor=0')).status).toBe(
            410
        );
    });

    it('never lowers the reset watermark', async () => {
        const first = await entry(
            user.id,
            'task',
            'task-0005',
            'delete',
            daysAgo(45)
        );
        await compactJournal({ now: NOW });
        await compactJournal({ now: NOW });

        expect(
            (await agent.get(`/api/v1/sync/pull?cursor=${first - 1}`)).status
        ).toBe(410);
        expect(
            (await agent.get(`/api/v1/sync/pull?cursor=${first}`)).status
        ).toBe(200);
    });

    it('hands out a snapshot cursor that pulls accept once the journal is empty', async () => {
        const gone = await entry(
            user.id,
            'task',
            'task-0007',
            'delete',
            daysAgo(45)
        );
        await compactJournal({ now: NOW });
        expect(await keptIds(user.id)).toEqual([]);

        const snapshot = await agent.get('/api/v1/sync/snapshot?entity=task');
        expect(snapshot.body.cursor).toBe(gone);
        const pull = await agent.get(
            `/api/v1/sync/pull?cursor=${snapshot.body.cursor}`
        );
        expect(pull.status).toBe(200);
        expect(pull.body.changes).toEqual([]);
    });

    it('reads the retention from CADENCE_SYNC_JOURNAL_RETENTION_DAYS', () => {
        const saved = process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS;
        try {
            delete process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS;
            expect(retentionDays()).toBe(30);
            process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS = '7';
            expect(retentionDays()).toBe(7);
            process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS = 'soon';
            expect(retentionDays()).toBe(30);
            process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS = '0';
            expect(retentionDays()).toBe(30);
        } finally {
            if (saved === undefined)
                delete process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS;
            else process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS = saved;
        }
    });

    it('honours the configured retention', async () => {
        const old = await entry(
            user.id,
            'task',
            'task-0006',
            'upsert',
            daysAgo(10)
        );
        const latest = await entry(
            user.id,
            'task',
            'task-0006',
            'upsert',
            daysAgo(9)
        );

        await compactJournal({ now: NOW, retentionDays: 30 });
        expect(await keptIds(user.id)).toEqual([old, latest]);

        await compactJournal({ now: NOW, retentionDays: 7 });
        expect(await keptIds(user.id)).toEqual([latest]);
    });
});

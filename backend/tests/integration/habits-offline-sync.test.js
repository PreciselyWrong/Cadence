const request = require('supertest');
const app = require('../../app');
const {
    Task,
    User,
    RecurringCompletion,
    IdempotencyKey,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { fingerprint } = require('../../services/idempotencyService');

// Client-chosen uids use the same 15-character nanoid alphabet as the server.
const UID_A = 'a1b2c3d4e5f6g7h';
const UID_B = 'h7g6f5e4d3c2b1a';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Habits offline sync', () => {
    let user, agent, otherAgent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'sync@example.com' });
        await User.update(
            { timezone: 'Europe/Athens' },
            { where: { id: user.id } }
        );
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'sync@example.com', password: 'password123' });

        await createTestUser({ email: 'sync-other@example.com' });
        otherAgent = request.agent(app);
        await otherAgent
            .post('/api/login')
            .send({ email: 'sync-other@example.com', password: 'password123' });
    });

    const createHabit = (body = {}) =>
        agent.post('/api/habits').send({ name: 'Read', ...body });

    // Sequelize drops updated_at from a silent update, so the test moves the
    // timestamp with SQL in the same text format Sequelize stores.
    const backdate = async (model, where, date) => {
        const rows = await model.findAll({
            where,
            attributes: ['id'],
            raw: true,
        });
        const stored = date
            .toISOString()
            .replace('T', ' ')
            .replace('Z', ' +00:00');
        await model.sequelize.query(
            `UPDATE ${model.getTableName()} SET updated_at = :stored WHERE id IN (:ids)`,
            {
                replacements: {
                    stored,
                    ids: rows.map((r) => r.id),
                },
            }
        );
    };

    describe('client uid on habits', () => {
        it('stores the uid the client chose', async () => {
            const res = await createHabit({ uid: UID_A });
            expect(res.status).toBe(201);
            expect(res.body.habit.uid).toBe(UID_A);
        });

        it('returns the existing habit (200) when the uid is sent again', async () => {
            await createHabit({ uid: UID_A, name: 'First' });
            const again = await createHabit({ uid: UID_A, name: 'Second' });
            expect(again.status).toBe(200);
            expect(again.body.habit.uid).toBe(UID_A);
            expect(again.body.habit.name).toBe('First');
            expect(await Task.count({ where: { uid: UID_A } })).toBe(1);
        });

        it('rejects a uid that is not in the uid format', async () => {
            const res = await createHabit({ uid: 'not a uid!' });
            expect(res.status).toBe(400);
        });

        it("returns 409 when another user's habit has the uid", async () => {
            await otherAgent
                .post('/api/habits')
                .send({ name: 'Theirs', uid: UID_A });
            const res = await createHabit({ uid: UID_A });
            expect(res.status).toBe(409);
            expect(await Task.count({ where: { uid: UID_A } })).toBe(1);
        });
    });

    describe('client uid on check-ins', () => {
        let habitUid;
        beforeEach(async () => {
            habitUid = (await createHabit({ habit_target_count: 3 })).body.habit
                .uid;
        });

        it('keeps one check-in per uid', async () => {
            const first = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .send({ uid: UID_A });
            const second = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .send({ uid: UID_A });
            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect(second.body.completion.id).toBe(first.body.completion.id);
            expect(second.body.completion.uid).toBe(UID_A);
            expect(
                await RecurringCompletion.count({ where: { uid: UID_A } })
            ).toBe(1);
        });

        it('gives a server uid to check-ins sent without one', async () => {
            const res = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .send({});
            expect(res.body.completion.uid).toMatch(/^[0-9a-jkmnp-z]{15}$/);
        });

        it("returns 409 when another user's check-in has the uid", async () => {
            const otherHabit = await otherAgent
                .post('/api/habits')
                .send({ name: 'Theirs', habit_target_count: 3 });
            await otherAgent
                .post(`/api/habits/${otherHabit.body.habit.uid}/complete`)
                .send({ uid: UID_B });
            const res = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .send({ uid: UID_B });
            expect(res.status).toBe(409);
        });
    });

    describe('Idempotency-Key', () => {
        it('replays the stored response for the same key and body', async () => {
            const body = { name: 'Once', habit_target_count: 3 };
            const first = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'key-create-1')
                .send(body);
            const second = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'key-create-1')
                .send(body);
            expect(first.status).toBe(201);
            expect(second.status).toBe(first.status);
            expect(second.body).toEqual(first.body);
            expect(second.headers['idempotent-replayed']).toBe('true');
            expect(await Task.count({ where: { name: 'Once' } })).toBe(1);
        });

        it('keeps a repeated check-in to one row', async () => {
            const habitUid = (await createHabit({ habit_target_count: 3 })).body
                .habit.uid;
            const send = () =>
                agent
                    .post(`/api/habits/${habitUid}/complete`)
                    .set('Idempotency-Key', 'key-checkin-1')
                    .send({ note: 'done' });
            const first = await send();
            const second = await send();
            expect(second.body).toEqual(first.body);
            expect(
                await RecurringCompletion.count({
                    where: { task_id: first.body.task.id },
                })
            ).toBe(1);
        });

        it('returns 422 when the same key comes with a different body', async () => {
            const habitUid = (await createHabit({ habit_target_count: 3 })).body
                .habit.uid;
            await agent
                .post(`/api/habits/${habitUid}/complete`)
                .set('Idempotency-Key', 'key-mismatch')
                .send({ note: 'one' });
            const res = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .set('Idempotency-Key', 'key-mismatch')
                .send({ note: 'two' });
            expect(res.status).toBe(422);
        });

        it('returns 422 when the same key is used on another path', async () => {
            const first = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'key-path')
                .send({ name: 'Path' });
            expect(first.status).toBe(201);
            const res = await agent
                .post(`/api/habits/${first.body.habit.uid}/skip`)
                .set('Idempotency-Key', 'key-path')
                .send({});
            expect(res.status).toBe(422);
        });

        it('does not share keys between users', async () => {
            await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'shared-key')
                .send({ name: 'Mine' });
            const res = await otherAgent
                .post('/api/habits')
                .set('Idempotency-Key', 'shared-key')
                .send({ name: 'Mine' });
            expect(res.status).toBe(201);
            expect(res.headers['idempotent-replayed']).toBeUndefined();
        });

        it('rejects a malformed key', async () => {
            const res = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'x'.repeat(256))
                .send({ name: 'Long key' });
            expect(res.status).toBe(400);
        });

        it('runs the request again once the key is older than 24 hours', async () => {
            const first = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'key-expiry')
                .send({ name: 'Expiring' });
            await IdempotencyKey.update(
                { created_at: new Date(Date.now() - DAY_MS - 60 * 1000) },
                {
                    where: { user_id: user.id, key: 'key-expiry' },
                    silent: true,
                }
            );
            const second = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'key-expiry')
                .send({ name: 'Expiring' });
            expect(second.status).toBe(201);
            expect(second.body.habit.uid).not.toBe(first.body.habit.uid);
            expect(second.headers['idempotent-replayed']).toBeUndefined();
        });

        it('deletes keys older than 24 hours on the next keyed write', async () => {
            await IdempotencyKey.create({
                user_id: user.id,
                key: 'stale-key',
                method: 'POST',
                path: '/api/habits',
                request_hash: 'x',
                status: 201,
                body: '{}',
                created_at: new Date(Date.now() - DAY_MS - 1000),
            });
            await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'fresh-key')
                .send({ name: 'Fresh' });
            expect(
                await IdempotencyKey.count({ where: { key: 'stale-key' } })
            ).toBe(0);
            expect(
                await IdempotencyKey.count({ where: { key: 'fresh-key' } })
            ).toBe(1);
        });

        it('answers 409 while the first request with the key is still running', async () => {
            await IdempotencyKey.create({
                user_id: user.id,
                key: 'in-flight',
                method: 'POST',
                path: '/api/habits',
                request_hash: fingerprint('POST', '/api/habits', {
                    name: 'Busy',
                }),
                status: null,
                body: null,
                created_at: new Date(),
            });
            const res = await agent
                .post('/api/habits')
                .set('Idempotency-Key', 'in-flight')
                .send({ name: 'Busy' });
            expect(res.status).toBe(409);
        });
    });

    describe('updated_since', () => {
        it('lists only habits changed after the timestamp, with server_time', async () => {
            const old = (await createHabit({ name: 'Old' })).body.habit;
            const fresh = (await createHabit({ name: 'Fresh' })).body.habit;
            await backdate(
                Task,
                { uid: old.uid },
                new Date('2020-01-01T00:00:00Z')
            );

            const res = await agent
                .get('/api/habits')
                .query({ updated_since: '2025-01-01T00:00:00Z' });
            expect(res.status).toBe(200);
            expect(res.body.habits.map((h) => h.uid)).toEqual([fresh.uid]);
            expect(new Date(res.body.server_time).getTime()).not.toBeNaN();
        });

        it('includes archived habits so a client sees the archive', async () => {
            const habit = (await createHabit({ name: 'Archived' })).body.habit;
            await backdate(
                Task,
                { uid: habit.uid },
                new Date('2020-01-01T00:00:00Z')
            );
            await agent.post(`/api/habits/${habit.uid}/archive`);
            const res = await agent
                .get('/api/habits')
                .query({ updated_since: '2025-01-01T00:00:00Z' });
            expect(res.body.habits).toHaveLength(1);
            expect(res.body.habits[0].habit_archived).toBe(true);
        });

        it('lists only check-ins changed after the timestamp', async () => {
            const habitUid = (await createHabit({ habit_target_count: 3 })).body
                .habit.uid;
            const oldRes = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .send({});
            const newRes = await agent
                .post(`/api/habits/${habitUid}/complete`)
                .send({});
            await backdate(
                RecurringCompletion,
                { id: oldRes.body.completion.id },
                new Date('2020-01-01T00:00:00Z')
            );

            const res = await agent
                .get(`/api/habits/${habitUid}/completions`)
                .query({ updated_since: '2025-01-01T00:00:00Z' });
            expect(res.status).toBe(200);
            expect(res.body.completions.map((c) => c.id)).toEqual([
                newRes.body.completion.id,
            ]);
            expect(res.body.server_time).toBeDefined();
        });

        it('rejects a value that is not a date', async () => {
            const res = await agent
                .get('/api/habits')
                .query({ updated_since: 'yesterday-ish' });
            expect(res.status).toBe(400);
        });
    });
});

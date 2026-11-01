const request = require('supertest');
const app = require('../../app');
const { Task, TaskEvent, RecurringCompletion } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const {
    calculateVirtualOccurrences,
} = require('../../modules/tasks/recurringTaskService');

const day = (value) => new Date(value).toISOString().slice(0, 10);

describe('Editing one occurrence, the following ones, or the whole series', () => {
    let user, agent;

    const signIn = async (fields = {}) => {
        user = await createTestUser({ email: 'edit@example.com', ...fields });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'edit@example.com', password: 'password123' });
    };

    const createSeries = async (fields) => {
        const res = await agent
            .post('/api/task')
            .send({ name: 'Water plants', ...fields });
        expect(res.status).toBe(201);
        return res.body;
    };
    const daily = (fields = {}) =>
        createSeries({
            recurrence_type: 'daily',
            recurrence_interval: 1,
            due_date: '2027-03-01',
            ...fields,
        });
    const edit = (uid, body) =>
        agent.post(`/api/task/${uid}/edit-occurrence`).send(body);
    const remove = (uid, body) =>
        agent.post(`/api/task/${uid}/delete-occurrence`).send(body);
    const reload = (uid) => Task.findOne({ where: { uid } });
    const nextDays = (task, count, timezone = 'UTC') =>
        calculateVirtualOccurrences(task, count, null, timezone).map((o) =>
            day(o.due_date)
        );

    describe('in UTC', () => {
        beforeEach(() => signIn());

        describe('this occurrence only', () => {
            it('renames the current occurrence alone and advances the series', async () => {
                const series = await daily();

                const res = await edit(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-01',
                    changes: { name: 'Water the cactus' },
                });

                expect(res.status).toBe(200);
                expect(res.body.edited.uid).not.toBe(series.uid);
                const edited = await reload(res.body.edited.uid);
                expect(edited.name).toBe('Water the cactus');
                expect(edited.recurrence_type).toBe('none');
                expect(day(edited.due_date)).toBe('2027-03-01');
                const parent = await reload(series.uid);
                expect(parent.name).toBe('Water plants');
                expect(day(parent.due_date)).toBe('2027-03-02');
            });

            it('changes the estimate and priority of a later occurrence and leaves a gap', async () => {
                const series = await daily({ estimated_minutes: 15 });

                const res = await edit(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-03',
                    changes: { estimated_minutes: 45, priority: 'high' },
                });

                expect(res.status).toBe(200);
                const edited = await reload(res.body.edited.uid);
                expect(edited.estimated_minutes).toBe(45);
                expect(edited.priority).toBe(2);
                expect(day(edited.due_date)).toBe('2027-03-03');
                const parent = await reload(series.uid);
                expect(parent.estimated_minutes).toBe(15);
                expect(parent.recurrence_exdates).toEqual(['2027-03-03']);
                expect(nextDays(parent, 3)).toEqual([
                    '2027-03-01',
                    '2027-03-02',
                    '2027-03-04',
                ]);
            });

            it('changes the time of one occurrence and keeps its tags', async () => {
                const series = await daily({
                    due_time: '09:00',
                    tags: [{ name: 'garden' }],
                });

                const res = await edit(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-02',
                    changes: { due_date: '2027-03-02', due_time: '14:30' },
                });

                expect(res.status).toBe(200);
                const edited = await reload(res.body.edited.uid);
                expect(edited.due_date.toISOString()).toBe(
                    '2027-03-02T14:30:00.000Z'
                );
                expect((await edited.getTags()).map((tag) => tag.name)).toEqual(
                    ['garden']
                );
                const parent = await reload(series.uid);
                expect(parent.due_date.toISOString()).toBe(
                    '2027-03-01T09:00:00.000Z'
                );
            });

            it('moves an occurrence to another day and logs the move on the series', async () => {
                const series = await daily();

                const res = await edit(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-03',
                    changes: { due_date: '2027-03-05', name: 'Later' },
                });

                expect(res.status).toBe(200);
                const edited = await reload(res.body.edited.uid);
                expect(day(edited.due_date)).toBe('2027-03-05');
                expect(edited.name).toBe('Later');
                const moveEvent = await TaskEvent.findOne({
                    where: {
                        task_id: (await reload(series.uid)).id,
                        event_type: 'due_date_changed',
                    },
                });
                expect(moveEvent.metadata).toMatchObject({
                    action: 'move_occurrence',
                    scope: 'this',
                });
                const renamed = await TaskEvent.findOne({
                    where: { task_id: edited.id, event_type: 'name_changed' },
                });
                expect(renamed.new_value).toEqual({ name: 'Later' });
            });

            it('refuses a repeat rule change on one occurrence', async () => {
                const series = await daily();

                const res = await edit(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-01',
                    changes: { recurrence_interval: 2 },
                });

                expect(res.status).toBe(400);
            });
        });

        describe('this and following occurrences', () => {
            it('ends the series the day before and starts a renamed one with the same rule', async () => {
                const series = await daily({ tags: [{ name: 'garden' }] });
                const project = await agent
                    .post('/api/project')
                    .send({ name: 'Home' });

                const res = await edit(series.uid, {
                    scope: 'following',
                    occurrence_date: '2027-03-04',
                    changes: {
                        name: 'Water the cactus',
                        project_uid: project.body.uid,
                    },
                });

                expect(res.status).toBe(200);
                const parent = await reload(series.uid);
                expect(parent.name).toBe('Water plants');
                expect(nextDays(parent, 5)).toEqual([
                    '2027-03-01',
                    '2027-03-02',
                    '2027-03-03',
                ]);
                const next = await reload(res.body.edited.uid);
                expect(next.name).toBe('Water the cactus');
                expect(next.project_id).toBe(project.body.id);
                expect(next.recurrence_type).toBe('daily');
                expect(nextDays(next, 2)).toEqual(['2027-03-04', '2027-03-05']);
                expect((await next.getTags()).map((tag) => tag.name)).toEqual([
                    'garden',
                ]);
            });

            it('on the first occurrence, edits the whole series', async () => {
                const series = await daily();

                const res = await edit(series.uid, {
                    scope: 'following',
                    occurrence_date: '2027-03-01',
                    changes: { name: 'Water everything' },
                });

                expect(res.status).toBe(200);
                expect(res.body.edited.uid).toBe(series.uid);
                expect((await reload(series.uid)).name).toBe(
                    'Water everything'
                );
                expect(await Task.count({ where: { user_id: user.id } })).toBe(
                    1
                );
            });
        });

        describe('all occurrences', () => {
            it('changes the series from a later occurrence without moving it', async () => {
                const series = await daily();

                const res = await edit(series.uid, {
                    scope: 'all',
                    occurrence_date: '2027-03-05',
                    changes: { note: 'Use rain water' },
                });

                expect(res.status).toBe(200);
                expect(res.body.edited.uid).toBe(series.uid);
                const parent = await reload(series.uid);
                expect(parent.note).toBe('Use rain water');
                expect(day(parent.due_date)).toBe('2027-03-01');
                expect(await Task.count({ where: { user_id: user.id } })).toBe(
                    1
                );
            });

            it('moves the reminder with the whole series', async () => {
                const series = await daily({ due_time: '09:00' });
                await Task.update(
                    { reminder_at: new Date('2027-03-01T08:00:00.000Z') },
                    { where: { uid: series.uid } }
                );

                const res = await edit(series.uid, {
                    scope: 'all',
                    occurrence_date: '2027-03-01',
                    changes: { due_date: '2027-03-03', due_time: '09:00' },
                });

                expect(res.status).toBe(200);
                const parent = await reload(series.uid);
                expect(parent.due_date.toISOString()).toBe(
                    '2027-03-03T09:00:00.000Z'
                );
                expect(parent.reminder_at.toISOString()).toBe(
                    '2027-03-03T08:00:00.000Z'
                );
            });

            it('puts a reminder set on a later occurrence on the current one', async () => {
                const series = await daily({ due_time: '09:00' });

                const res = await edit(series.uid, {
                    scope: 'all',
                    occurrence_date: '2027-03-05',
                    changes: { reminder_at: '2027-03-05T08:45:00.000Z' },
                });

                expect(res.status).toBe(200);
                const parent = await reload(series.uid);
                expect(parent.reminder_at.toISOString()).toBe(
                    '2027-03-01T08:45:00.000Z'
                );
            });
        });

        it('leaves the series as it was when the change is refused', async () => {
            const series = await daily();

            const res = await edit(series.uid, {
                scope: 'this',
                occurrence_date: '2027-03-03',
                changes: { name: 'Elsewhere', project_uid: 'nope-not-a-uid' },
            });

            expect(res.status).toBeGreaterThanOrEqual(400);
            const parent = await reload(series.uid);
            expect(parent.recurrence_exdates || []).toEqual([]);
            expect(await Task.count({ where: { user_id: user.id } })).toBe(1);
        });

        it('syncs the split-off occurrence and the shortened series', async () => {
            const series = await daily();
            const res = await edit(series.uid, {
                scope: 'following',
                occurrence_date: '2027-03-04',
                changes: { name: 'Water the cactus' },
            });

            const pulled = await agent.get('/api/v1/sync/pull?cursor=0');
            const last = (uid) =>
                pulled.body.changes.filter((c) => c.uid === uid).pop();

            expect(last(res.body.edited.uid).data).toMatchObject({
                name: 'Water the cactus',
                recurrence_type: 'daily',
            });
            expect(day(last(series.uid).data.recurrence_end_date)).toBe(
                '2027-03-03'
            );
        });

        describe('deleting', () => {
            it('skips the current occurrence', async () => {
                const series = await daily();

                const res = await remove(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-01',
                });

                expect(res.status).toBe(200);
                const parent = await reload(series.uid);
                expect(day(parent.due_date)).toBe('2027-03-02');
                expect(
                    await RecurringCompletion.count({
                        where: { task_id: parent.id, skipped: true },
                    })
                ).toBe(1);
            });

            it('leaves a later occurrence out of the series', async () => {
                const series = await daily();

                await remove(series.uid, {
                    scope: 'this',
                    occurrence_date: '2027-03-03',
                });

                const parent = await reload(series.uid);
                expect(parent.recurrence_exdates).toEqual(['2027-03-03']);
            });

            it('ends the series before the following occurrences', async () => {
                const series = await daily();

                const res = await remove(series.uid, {
                    scope: 'following',
                    occurrence_date: '2027-03-04',
                });

                expect(res.body.deleted).toBe(false);
                expect(nextDays(await reload(series.uid), 5)).toEqual([
                    '2027-03-01',
                    '2027-03-02',
                    '2027-03-03',
                ]);
            });

            it.each([
                ['following', '2027-03-01'],
                ['all', '2027-03-04'],
            ])(
                'deletes the series for %s from %s',
                async (scope, occurrenceDate) => {
                    const series = await daily();

                    const res = await remove(series.uid, {
                        scope,
                        occurrence_date: occurrenceDate,
                    });

                    expect(res.body.deleted).toBe(true);
                    expect(await reload(series.uid)).toBeNull();
                }
            );
        });
    });

    // Europe/Zurich leaves winter time on 2027-03-28.
    describe('across a daylight-saving switch', () => {
        beforeEach(() => signIn({ timezone: 'Europe/Zurich' }));

        it('starts the following series at the new local time after the switch', async () => {
            const series = await createSeries({
                recurrence_type: 'daily',
                recurrence_interval: 1,
                due_date: '2027-03-26',
                due_time: '09:00',
            });

            const res = await edit(series.uid, {
                scope: 'following',
                occurrence_date: '2027-03-29',
                changes: { due_date: '2027-03-29', due_time: '10:00' },
            });

            expect(res.status).toBe(200);
            const next = await reload(res.body.edited.uid);
            expect(next.due_date.toISOString()).toBe(
                '2027-03-29T08:00:00.000Z'
            );
            const parent = await reload(series.uid);
            expect(parent.due_date.toISOString()).toBe(
                '2027-03-26T08:00:00.000Z'
            );
        });

        it('keeps the local time of the reminder on a split-off occurrence', async () => {
            const series = await createSeries({
                recurrence_type: 'daily',
                recurrence_interval: 1,
                due_date: '2027-03-26',
                due_time: '09:00',
            });
            await Task.update(
                { reminder_at: new Date('2027-03-26T07:30:00.000Z') },
                { where: { uid: series.uid } }
            );

            const res = await edit(series.uid, {
                scope: 'this',
                occurrence_date: '2027-03-29',
                changes: { priority: 'high' },
            });

            expect(res.status).toBe(200);
            const edited = await reload(res.body.edited.uid);
            expect(edited.due_date.toISOString()).toBe(
                '2027-03-29T07:00:00.000Z'
            );
            expect(edited.reminder_at.toISOString()).toBe(
                '2027-03-29T06:30:00.000Z'
            );
        });
    });
});

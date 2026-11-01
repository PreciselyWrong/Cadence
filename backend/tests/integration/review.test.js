const request = require('supertest');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const app = require('../../app');
const {
    Task,
    TaskEvent,
    Project,
    InboxItem,
    Tag,
    Permission,
    DailyPlan,
    DailyPlanItem,
    sequelize,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const day = (offset) =>
    moment.utc().startOf('day').add(offset, 'days').format('YYYY-MM-DD');

// Moves an event to noon on a past day, as if it was written then.
const backdate = async (event, offset) => {
    await sequelize.query(
        'UPDATE task_events SET created_at = ? WHERE id = ?',
        {
            replacements: [
                moment
                    .utc()
                    .startOf('day')
                    .add(offset, 'days')
                    .add(12, 'hours')
                    .toDate(),
                event.id,
            ],
        }
    );
};

const lastDueEvent = (taskId) =>
    TaskEvent.findOne({
        where: { task_id: taskId, event_type: 'due_date_changed' },
        order: [['id', 'DESC']],
    });

describe('Review', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'review@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'review@example.com',
            password: 'password123',
        });
    });

    // Scenario 1: planned, then pushed off its day three times in a month.
    const pushThreeTimes = async (task) => {
        for (const [offset, to] of [
            [-10, -8],
            [-8, -5],
            [-5, -2],
        ]) {
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ due_date: day(to) });
            expect(res.status).toBe(200);
            await backdate(await lastDueEvent(task.id), offset);
        }
    };

    it('lists a task pushed off its day three times, with its history', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Test app X',
            due_date: moment.utc(day(-10)).endOf('day').toDate(),
        });
        await pushThreeTimes(task);

        const summary = await agent.get('/api/review');
        expect(summary.status).toBe(200);
        expect(summary.body.counts.pushed).toBe(1);

        const list = await agent.get('/api/review/pushed');
        expect(list.body.total).toBe(1);
        expect(list.body.items[0].task.uid).toBe(task.uid);
        expect(list.body.items[0].push).toMatchObject({
            recent_count: 3,
            frequent: true,
            last_postponed_on: day(-5),
        });

        const history = await agent.get(`/api/task/${task.uid}/postponements`);
        expect(history.status).toBe(200);
        expect(history.body.recent_count).toBe(3);
        expect(history.body.changes.map((c) => c.kind)).toEqual([
            'postponed',
            'postponed',
            'postponed',
        ]);

        // Keeping it as it is takes it off the list; the history stays.
        await agent.patch(`/api/task/${task.uid}`).send({ reviewed: true });
        expect((await agent.get('/api/review/pushed')).body.total).toBe(0);
        const after = await agent.get(`/api/task/${task.uid}/postponements`);
        expect(after.body.total_count).toBe(3);
        expect(after.body.recent_count).toBe(0);
    });

    // Scenario 2: a time shift and a deadline moved well ahead of time.
    it('does not count time shifts, far-ahead moves or repeated saves', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Meeting' });
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ due_date: day(0), due_time: '10:00' });
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ due_date: day(0), due_time: '11:00' });
        // The same value again logs nothing.
        await agent
            .patch(`/api/task/${task.uid}`)
            .send({ due_date: day(0), due_time: '11:00' });
        await agent.patch(`/api/task/${task.uid}`).send({ due_date: day(20) });
        await agent.patch(`/api/task/${task.uid}`).send({ due_date: day(25) });

        const history = await agent.get(`/api/task/${task.uid}/postponements`);
        expect(history.body.changes.map((c) => c.kind)).toEqual([
            'rescheduled',
            'postponed',
            'time_shift',
            'scheduled',
        ]);
        // The one real push (today → in 20 days) is not frequent.
        expect(history.body.recent_count).toBe(1);
        expect(history.body.frequent).toBe(false);
    });

    // Scenario 3: recurrence moves the due date by itself.
    it('logs no postponement when a recurring task moves on', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Water plants',
            recurrence_type: 'daily',
            recurrence_interval: 1,
            due_date: moment.utc(day(0)).endOf('day').toDate(),
        });
        for (let i = 0; i < 3; i++) {
            const res = await agent
                .patch(`/api/task/${task.uid}`)
                .send({ status: 'done' });
            expect(res.status).toBe(200);
        }
        expect(
            await TaskEvent.count({
                where: { task_id: task.id, event_type: 'due_date_changed' },
            })
        ).toBe(0);
        expect((await agent.get('/api/review')).body.counts.pushed).toBe(0);
    });

    it('ignores due changes written by an import or a sync', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Imported' });
        for (const offset of [-9, -6, -3]) {
            const event = await TaskEvent.create({
                task_id: task.id,
                user_id: user.id,
                event_type: 'due_date_changed',
                field_name: 'due_date',
                old_value: { due_date: day(offset) },
                new_value: { due_date: day(offset + 2) },
                metadata: { source: 'import' },
            });
            await backdate(event, offset);
        }
        expect((await agent.get('/api/review')).body.counts.pushed).toBe(0);
    });

    it('counts plan days left unfinished as pushes', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Tidy up' });
        for (const offset of [-6, -4, -2]) {
            const res = await agent
                .put(`/api/daily-plan/${day(offset)}`)
                .send({ items: [{ task_uid: task.uid }] });
            expect(res.status).toBe(200);
        }
        const list = await agent.get('/api/review/pushed');
        expect(list.body.total).toBe(1);
        expect(list.body.items[0].push.recent_count).toBe(3);
    });

    // Scenario 4 and 5: parked for later, with a review date.
    it('parks a task for later and brings it back on its review date', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Idea' });
        const parked = await agent.patch(`/api/task/${task.uid}`).send({
            later: true,
            in_view: true,
            review_on: day(30),
        });
        expect(parked.status).toBe(200);
        expect(parked.body.tags.map((t) => t.name)).toContain('someday');
        expect(parked.body.due_date).toBeNull();
        expect(parked.body.review_on).toBe(day(30));

        const later = await agent.get('/api/review/later');
        expect(later.body.total).toBe(1);
        expect(later.body.items[0].review_due).toBe(false);
        expect((await agent.get('/api/review')).body.counts.review_due).toBe(0);

        // Not in Plan my day.
        const candidates = await agent.get('/api/daily-plan/candidates');
        const all = [
            ...candidates.body.suggested,
            ...candidates.body.overdue,
            ...candidates.body.due_today,
        ].map((t) => t.uid);
        expect(all).not.toContain(task.uid);

        // Still found by search.
        const search = await agent.get('/api/search?q=Idea');
        expect(JSON.stringify(search.body)).toContain(task.uid);

        // The review date arrives.
        await Task.update({ review_on: day(0) }, { where: { id: task.id } });
        expect((await agent.get('/api/review')).body.counts.review_due).toBe(1);
        const due = await agent.get('/api/review/later');
        expect(due.body.items[0].review_due).toBe(true);

        // Back to active at once.
        const back = await agent
            .patch(`/api/task/${task.uid}`)
            .send({ later: false, review_on: null });
        expect(back.body.tags.map((t) => t.name)).not.toContain('someday');
        expect((await agent.get('/api/review/later')).body.total).toBe(0);
    });

    it('rejects malformed decision fields', async () => {
        const task = await Task.create({ user_id: user.id, name: 'Bad' });
        for (const body of [
            { review_on: 'tomorrow' },
            { week_of: '2026-13-01' },
            { in_view: 'maybe' },
        ]) {
            expect(
                (await agent.patch(`/api/task/${task.uid}`).send(body)).status
            ).toBe(400);
        }
    });

    // The week: committed tasks lead the suggestions, with planned time.
    it('commits tasks to the week and sums their estimates', async () => {
        const a = await Task.create({
            user_id: user.id,
            name: 'Committed',
            estimated_minutes: 90,
            priority: 0,
        });
        const b = await Task.create({
            user_id: user.id,
            name: 'Urgent-looking',
            priority: 2,
        });
        const c = await Task.create({ user_id: user.id, name: 'Possible' });
        await agent.patch(`/api/task/${a.uid}`).send({ week_of: 'this_week' });
        await agent.patch(`/api/task/${c.uid}`).send({ in_view: true });

        await agent
            .put('/api/review/week/capacity')
            .send({ capacity_minutes: 360 });
        const week = await agent.get('/api/review/week');
        expect(week.body.committed.map((t) => t.uid)).toEqual([a.uid]);
        expect(week.body.in_view.map((t) => t.uid)).toEqual([c.uid]);
        expect(week.body.planned_minutes).toBe(90);
        expect(week.body.capacity_minutes).toBe(360);

        const candidates = await agent.get('/api/daily-plan/candidates');
        expect(candidates.body.ranked.slice(0, 2)).toEqual([a.uid, c.uid]);
        expect(candidates.body.ranked).toContain(b.uid);
    });

    // Scenario 6: decisions are saved one by one, so a review resumes.
    it('remembers decisions made in an interrupted review', async () => {
        const tasks = [];
        for (let i = 0; i < 4; i++) {
            tasks.push(
                await Task.create({ user_id: user.id, name: `Idea ${i}` })
            );
        }
        await agent.patch(`/api/task/${tasks[0].uid}`).send({
            later: true,
            reviewed: true,
        });
        await agent
            .patch(`/api/task/${tasks[1].uid}`)
            .send({ week_of: 'this_week', reviewed: true });
        await agent
            .patch(`/api/task/${tasks[2].uid}`)
            .send({ in_view: true, reviewed: true });
        await agent
            .patch(`/api/task/${tasks[3].uid}`)
            .send({ status: 'cancelled', reviewed: true });

        const summary = await agent.get('/api/review');
        expect(summary.body.decided_this_week).toBe(3);
        expect(summary.body.counts.later).toBe(1);
        expect(await Task.count({ where: { user_id: user.id } })).toBe(4);
    });

    // Scenario 7: an active project with nothing to do next.
    it('flags active projects with no next action, not parked ones', async () => {
        const stuck = await Project.create({
            user_id: user.id,
            name: 'Stuck',
            status: 'in_progress',
        });
        const parked = await Project.create({
            user_id: user.id,
            name: 'Parked',
            status: 'in_progress',
        });
        const [someday] = await Tag.findOrCreate({
            where: { user_id: user.id, name: 'someday' },
            defaults: { tag_type: 'system' },
        });
        await parked.addTag(someday);
        await Project.create({
            user_id: user.id,
            name: 'Waiting',
            status: 'waiting',
        });
        const waitingOnSomeone = await Project.create({
            user_id: user.id,
            name: 'Blocked',
            status: 'in_progress',
        });
        await Task.create({
            user_id: user.id,
            name: 'Reply from bank',
            project_id: waitingOnSomeone.id,
            status: 4,
        });

        const list = await agent.get('/api/review/projects');
        expect(list.body.items.map((i) => i.project.name)).toEqual(['Stuck']);
        expect(list.body.items[0].reasons).toEqual(['no_next_action']);

        // Keeping it hides it until the project changes.
        await agent.post(`/api/project/${stuck.uid}/reviewed`);
        expect((await agent.get('/api/review/projects')).body.total).toBe(0);
        await new Promise((r) => setTimeout(r, 1100));
        const next = await Task.create({
            user_id: user.id,
            name: 'Next step',
            project_id: stuck.id,
        });
        await next.update({ status: 2, completed_at: new Date() });
        expect((await agent.get('/api/review/projects')).body.total).toBe(1);
    });

    it('lists inbox items as waiting for a decision', async () => {
        await InboxItem.create({
            user_id: user.id,
            content: 'Look at that tool',
            status: 'added',
            source: 'web',
        });
        await InboxItem.create({
            user_id: user.id,
            content: 'Done already',
            status: 'processed',
            source: 'web',
        });
        const list = await agent.get('/api/review/undecided');
        expect(list.body.total).toBe(1);
        expect(list.body.items[0].content).toBe('Look at that tool');
    });

    it('shows old tasks that have not moved in 90 days', async () => {
        const old = await Task.create({ user_id: user.id, name: 'Old' });
        await Task.create({ user_id: user.id, name: 'Fresh' });
        await sequelize.query('UPDATE tasks SET updated_at = ? WHERE id = ?', {
            replacements: [moment.utc().subtract(120, 'days').toDate(), old.id],
        });
        const list = await agent.get('/api/review/stale');
        expect(list.body.items.map((i) => i.task.name)).toEqual(['Old']);
    });

    // Scenario 9: shared tasks, other people's history.
    it('counts only the viewer’s own pushes and hides other users’ tasks', async () => {
        const other = await createTestUser({ email: 'other@example.com' });
        const theirs = await Task.create({
            user_id: other.id,
            name: 'Not mine',
            due_date: moment.utc(day(-10)).endOf('day').toDate(),
        });
        for (const offset of [-9, -6, -3]) {
            const event = await TaskEvent.create({
                task_id: theirs.id,
                user_id: other.id,
                event_type: 'due_date_changed',
                field_name: 'due_date',
                old_value: { due_date: day(offset) },
                new_value: { due_date: day(offset + 2) },
                metadata: { source: 'web' },
            });
            await backdate(event, offset);
        }
        expect((await agent.get('/api/review')).body.counts.pushed).toBe(0);
        expect(
            (await agent.get(`/api/task/${theirs.uid}/postponements`)).status
        ).toBe(403);

        // Shared read-only: the history shows only what I did.
        await Permission.create({
            user_id: user.id,
            resource_type: 'task',
            resource_uid: theirs.uid,
            access_level: 'ro',
            granted_by_user_id: other.id,
        });
        const history = await agent.get(
            `/api/task/${theirs.uid}/postponements`
        );
        expect(history.status).toBe(200);
        expect(history.body.changes).toEqual([]);
    });

    // Moving one occurrence of a recurring task is the user putting it off.
    describe('moving an occurrence', () => {
        const move = (uid, body) =>
            agent.post(`/api/task/${uid}/move-occurrence`).send(body);

        it('logs a postponement on the series, with the days as given', async () => {
            const series = await Task.create({
                user_id: user.id,
                name: 'Water plants',
                recurrence_type: 'daily',
                recurrence_interval: 1,
                due_date: moment.utc(day(0)).startOf('day').toDate(),
            });

            const res = await move(series.uid, {
                scope: 'this',
                occurrence_date: day(0),
                due_date: day(3),
            });
            expect(res.status).toBe(200);

            const event = await lastDueEvent(series.id);
            expect(event.metadata).toMatchObject({
                source: 'web',
                action: 'move_occurrence',
                scope: 'this',
            });
            expect(event.old_value.due_date).toBe(day(0));
            expect(event.new_value.due_date).toBe(day(3));

            const history = await agent.get(
                `/api/task/${series.uid}/postponements`
            );
            expect(history.body.changes.map((c) => c.kind)).toEqual([
                'postponed',
            ]);
            expect(history.body.total_count).toBe(1);
        });

        it('logs every scope, and an earlier move is not a postponement', async () => {
            const series = await Task.create({
                user_id: user.id,
                name: 'Weekly review',
                recurrence_type: 'daily',
                recurrence_interval: 1,
                due_date: moment.utc(day(0)).startOf('day').toDate(),
            });
            expect(
                (
                    await move(series.uid, {
                        scope: 'all',
                        occurrence_date: day(0),
                        due_date: day(1),
                    })
                ).status
            ).toBe(200);
            expect(
                (
                    await move(series.uid, {
                        scope: 'following',
                        occurrence_date: day(1),
                        due_date: day(0),
                    })
                ).status
            ).toBe(200);

            const events = await TaskEvent.findAll({
                where: { task_id: series.id, event_type: 'due_date_changed' },
                order: [['id', 'ASC']],
            });
            expect(events.map((e) => e.metadata.scope)).toEqual([
                'all',
                'following',
            ]);
            const history = await agent.get(
                `/api/task/${series.uid}/postponements`
            );
            expect(history.body.changes.map((c) => c.kind).sort()).toEqual([
                'advanced',
                'postponed',
            ]);
        });

        it('logs nothing when the move is refused', async () => {
            const series = await Task.create({
                user_id: user.id,
                name: 'Water plants',
                recurrence_type: 'daily',
                recurrence_interval: 1,
                due_date: moment.utc(day(0)).startOf('day').toDate(),
            });
            const res = await move(series.uid, {
                scope: 'nope',
                occurrence_date: day(0),
                due_date: day(3),
            });
            expect(res.status).toBe(400);
            expect(
                await TaskEvent.count({
                    where: {
                        task_id: series.id,
                        event_type: 'due_date_changed',
                    },
                })
            ).toBe(0);
        });
    });

    // A due date changed on the user's own device, pushed later through
    // offline sync, is the user's own decision.
    describe('offline sync from a device', () => {
        const hlc = (ms, node = 'devA') =>
            `${String(ms).padStart(13, '0')}-0000-${node}`;
        const upsert = (opId, uid, fields, clock) => ({
            op_id: opId,
            entity: 'task',
            uid,
            action: 'upsert',
            fields: Object.fromEntries(
                Object.entries(fields).map(([k, v]) => [
                    k,
                    { value: v, hlc: clock },
                ])
            ),
        });
        const push = (ops) => agent.post('/api/v1/sync/push').send({ ops });
        const dueEvents = async (uid) => {
            const task = await Task.findOne({ where: { uid } });
            return TaskEvent.findAll({
                where: { task_id: task.id, event_type: 'due_date_changed' },
                order: [['id', 'ASC']],
            });
        };
        const iso = (offset) => `${day(offset)}T09:00:00.000Z`;

        it('logs a device postponement at the time it was made', async () => {
            const longAgo = moment.utc().subtract(5, 'days').valueOf();
            await push([
                upsert(
                    'op-a',
                    'devtask0000001',
                    { name: 'Call bank', due_date: iso(-5) },
                    hlc(longAgo - 1000)
                ),
            ]);
            expect(await dueEvents('devtask0000001')).toHaveLength(0);

            const res = await push([
                upsert(
                    'op-b',
                    'devtask0000001',
                    { due_date: iso(-1) },
                    hlc(longAgo)
                ),
            ]);
            expect(res.body.results[0].status).toBe('applied');

            const events = await dueEvents('devtask0000001');
            expect(events).toHaveLength(1);
            expect(events[0].metadata.source).toBe('device');
            expect(moment.utc(events[0].created_at).format('YYYY-MM-DD')).toBe(
                day(-5)
            );

            const history = await agent.get(
                '/api/task/devtask0000001/postponements'
            );
            expect(history.body.changes.map((c) => c.kind)).toEqual([
                'postponed',
            ]);
            expect(history.body.changes[0].source).toBe('device');
            expect(history.body.total_count).toBe(1);
        });

        it('logs nothing for a new task, an unchanged date or a recurring task', async () => {
            const now = Date.now();
            await push([
                upsert(
                    'op-1',
                    'devtask0000002',
                    { name: 'Plain', due_date: iso(0) },
                    hlc(now - 3000)
                ),
                upsert(
                    'op-2',
                    'devtask0000003',
                    {
                        name: 'Daily',
                        due_date: iso(0),
                        recurrence_type: 'daily',
                        recurrence_interval: 1,
                    },
                    hlc(now - 3000)
                ),
            ]);
            await push([
                upsert(
                    'op-3',
                    'devtask0000002',
                    { due_date: iso(0), name: 'Plain again' },
                    hlc(now - 2000)
                ),
                upsert(
                    'op-4',
                    'devtask0000003',
                    { due_date: iso(1) },
                    hlc(now - 2000)
                ),
            ]);
            expect(await dueEvents('devtask0000002')).toHaveLength(0);
            expect(await dueEvents('devtask0000003')).toHaveLength(0);
        });

        it('does not log a date that lost the merge', async () => {
            const now = Date.now();
            await push([
                upsert(
                    'op-x',
                    'devtask0000004',
                    { name: 'Merge', due_date: iso(0) },
                    hlc(now)
                ),
            ]);
            const res = await push([
                upsert(
                    'op-y',
                    'devtask0000004',
                    { due_date: iso(4) },
                    hlc(now - 60000)
                ),
            ]);
            expect(res.body.results[0].status).toBe('conflict');
            expect(await dueEvents('devtask0000004')).toHaveLength(0);
        });
    });

    // Scenario 9, with history on both sides: a task two people can edit.
    it('keeps each person’s postponement history to themselves on a shared task', async () => {
        const other = await createTestUser({ email: 'partner@example.com' });
        const partner = request.agent(app);
        await partner.post('/api/login').send({
            email: 'partner@example.com',
            password: 'password123',
        });
        const stranger = await createTestUser({ email: 'nobody@example.com' });
        const outsider = request.agent(app);
        await outsider.post('/api/login').send({
            email: 'nobody@example.com',
            password: 'password123',
        });

        const task = await Task.create({
            user_id: user.id,
            name: 'Shared chore',
            due_date: moment.utc(day(-10)).endOf('day').toDate(),
        });
        await Permission.create({
            user_id: other.id,
            resource_type: 'task',
            resource_uid: task.uid,
            access_level: 'rw',
            granted_by_user_id: user.id,
        });

        await pushThreeTimes(task);
        const theirs = await partner
            .patch(`/api/task/${task.uid}`)
            .send({ due_date: day(-1) });
        expect(theirs.status).toBe(200);

        const mine = await agent.get(`/api/task/${task.uid}/postponements`);
        expect(mine.body.total_count).toBe(3);
        expect(mine.body.changes).toHaveLength(3);

        const hers = await partner.get(`/api/task/${task.uid}/postponements`);
        expect(hers.status).toBe(200);
        expect(hers.body.total_count).toBe(1);
        expect(hers.body.changes).toHaveLength(1);
        expect(hers.body.recent_count).toBe(1);
        expect(hers.body.frequent).toBe(false);

        // Her one push never reaches my list, and mine never reaches hers.
        const myList = await agent.get('/api/review/pushed');
        expect(myList.body.items[0].push.recent_count).toBe(3);
        expect((await partner.get('/api/review/pushed')).body.total).toBe(0);
        expect((await partner.get('/api/review')).body.counts.pushed).toBe(0);

        expect(
            (await outsider.get(`/api/task/${task.uid}/postponements`)).status
        ).toBe(403);
        expect((await outsider.get('/api/review')).body.counts.pushed).toBe(0);
        expect(stranger.id).not.toBe(other.id);
    });

    // Nothing is counted at write time: the same events and plans give the
    // same numbers wherever they are read.
    it('recomputes the same counters from task_events and daily_plans alone', async () => {
        const pushed = await Task.create({
            user_id: user.id,
            name: 'Pushed by dates',
            due_date: moment.utc(day(-10)).endOf('day').toDate(),
        });
        await pushThreeTimes(pushed);
        const planned = await Task.create({
            user_id: user.id,
            name: 'Planned',
        });
        for (const offset of [-6, -4, -2]) {
            await agent
                .put(`/api/daily-plan/${day(offset)}`)
                .send({ items: [{ task_uid: planned.uid }] });
        }
        const kept = await Task.create({
            user_id: user.id,
            name: 'Kept',
            due_date: moment.utc(day(-12)).endOf('day').toDate(),
        });
        for (const [offset, to] of [
            [-12, -9],
            [-9, -7],
            [-7, -3],
        ]) {
            await agent
                .patch(`/api/task/${kept.uid}`)
                .send({ due_date: day(to) });
            await backdate(await lastDueEvent(kept.id), offset);
        }
        await agent.patch(`/api/task/${kept.uid}`).send({ reviewed: true });

        const read = async (who, rows) => {
            const names = new Map(rows.map((row) => [row.uid, row.name]));
            const list = await who.get('/api/review/pushed');
            const histories = {};
            for (const row of rows) {
                const history = await who.get(
                    `/api/task/${row.uid}/postponements`
                );
                histories[row.name] = {
                    ...history.body,
                    created_at: undefined,
                    last_activity_at: undefined,
                };
            }
            return {
                counts: (await who.get('/api/review')).body.counts,
                pushed: list.body.items.map((item) => ({
                    name: names.get(item.task.uid),
                    push: item.push,
                })),
                histories,
            };
        };
        const original = await read(agent, [pushed, planned, kept]);
        expect(original.counts.pushed).toBe(2);
        expect(original.histories.Kept.recent_count).toBe(0);
        expect(original.histories.Kept.total_count).toBe(3);
        expect(await read(agent, [pushed, planned, kept])).toEqual(original);

        // A second account that only has the same rows.
        const copyUser = await createTestUser({ email: 'copy@example.com' });
        const copyAgent = request.agent(app);
        await copyAgent.post('/api/login').send({
            email: 'copy@example.com',
            password: 'password123',
        });
        const copies = [];
        const idMap = new Map();
        for (const source of [pushed, planned, kept]) {
            const fresh = await Task.findByPk(source.id);
            const copy = await Task.create({
                user_id: copyUser.id,
                name: fresh.name,
                status: fresh.status,
                due_date: fresh.due_date,
                reviewed_at: fresh.reviewed_at,
            });
            idMap.set(source.id, copy.id);
            copies.push(copy);
        }
        const events = await TaskEvent.findAll({
            where: { task_id: { [Op.in]: [...idMap.keys()] } },
        });
        for (const event of events) {
            await TaskEvent.create({
                task_id: idMap.get(event.task_id),
                user_id: copyUser.id,
                event_type: event.event_type,
                field_name: event.field_name,
                old_value: event.old_value,
                new_value: event.new_value,
                metadata: event.metadata,
                created_at: event.created_at,
            });
        }
        const plans = await DailyPlan.findAll({ where: { user_id: user.id } });
        for (const plan of plans) {
            const copyPlan = await DailyPlan.create({
                user_id: copyUser.id,
                plan_date: plan.plan_date,
            });
            const items = await DailyPlanItem.findAll({
                where: { daily_plan_id: plan.id },
            });
            for (const item of items) {
                await DailyPlanItem.create({
                    daily_plan_id: copyPlan.id,
                    task_id: idMap.get(item.task_id),
                    position: item.position,
                });
            }
        }

        const rebuilt = await read(copyAgent, copies);
        expect(rebuilt).toEqual(original);
    });

    it('needs a sign-in', async () => {
        expect((await request(app).get('/api/review')).status).toBe(401);
    });

    // Scenario 10: thousands of tasks and events stay quick and paged.
    it('answers in under 3 s with thousands of tasks and events, one page at a time', async () => {
        const taskRows = [];
        for (let i = 0; i < 3000; i++) {
            taskRows.push({ user_id: user.id, name: `Task ${i}` });
        }
        const tasks = await Task.bulkCreate(taskRows);
        // About 3.3 events per task, each from a different day: every task
        // has been pushed three times or more in the last month.
        const events = [];
        for (let i = 0; i < 10000; i++) {
            const nth = Math.floor(i / 3000);
            const from = -20 + nth * 3;
            const at = moment
                .utc()
                .startOf('day')
                .add(from, 'days')
                .add(12, 'hours')
                .toDate();
            events.push({
                task_id: tasks[i % 3000].id,
                user_id: user.id,
                event_type: 'due_date_changed',
                field_name: 'due_date',
                old_value: { due_date: day(from) },
                new_value: { due_date: day(from + 1) },
                metadata: { source: 'web' },
                created_at: at,
            });
        }
        for (let i = 0; i < events.length; i += 1000) {
            await TaskEvent.bulkCreate(events.slice(i, i + 1000));
        }
        await sequelize.query('UPDATE tasks SET updated_at = ? WHERE id <= ?', {
            replacements: [
                moment.utc().subtract(200, 'days').toDate(),
                tasks[1499].id,
            ],
        });

        const timed = async (path) => {
            const started = Date.now();
            const res = await agent.get(path);
            const elapsed = Date.now() - started;
            expect(res.status).toBe(200);
            // About 0.75 s locally; shared CI runners take up to twice that.
            // The budget still catches a return to loading every event.
            expect(elapsed).toBeLessThan(3000);
            return res;
        };

        const summary = await timed('/api/review');
        expect(summary.body.counts.pushed).toBe(3000);

        const pushed = await timed('/api/review/pushed');
        expect(pushed.body.total).toBe(3000);
        expect(pushed.body.items).toHaveLength(50);
        const next = await timed('/api/review/pushed?limit=200&offset=200');
        expect(next.body.items).toHaveLength(200);
        expect(next.body.items[0].task.uid).not.toBe(
            pushed.body.items[0].task.uid
        );

        const stale = await timed('/api/review/stale?limit=20');
        expect(stale.body.total).toBeGreaterThan(20);
        expect(stale.body.items).toHaveLength(20);
        for (const path of ['later', 'projects', 'undecided']) {
            await timed(`/api/review/${path}`);
        }
        await timed('/api/review/week');

        // The page size is bounded, not just defaulted.
        expect((await agent.get('/api/review/pushed?limit=5000')).status).toBe(
            400
        );
    }, 120000);
});

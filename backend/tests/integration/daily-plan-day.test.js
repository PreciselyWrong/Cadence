const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Task, Tag, DailyPlan, DailyPlanItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

const TZ = 'Europe/Athens';

describe('GET /api/daily-plan/day', () => {
    let user, agent, today, tomorrow, yesterday;

    const dayStart = (date, tz = TZ) =>
        moment.tz(date, tz).startOf('day').toDate();
    const dayOf = (offset, tz = TZ) =>
        moment.tz(tz).add(offset, 'days').format('YYYY-MM-DD');

    beforeEach(async () => {
        user = await createTestUser({
            email: 'day-planner@example.com',
            timezone: TZ,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'day-planner@example.com',
            password: 'password123',
        });
        today = dayOf(0);
        tomorrow = dayOf(1);
        yesterday = dayOf(-1);
    });

    const makeTask = (attrs = {}) =>
        Task.create({ name: 'A task', user_id: user.id, ...attrs });

    const plan = (date, ops) =>
        agent.patch(`/api/daily-plan/${date}`).send({ ops });

    const getDay = (query = {}) =>
        agent.get('/api/daily-plan/day').query(query);

    const uids = (tasks) => (tasks || []).map((task) => task.uid);

    const allSuggestionUids = (suggestions) =>
        Object.entries(suggestions)
            .filter(
                ([key]) => key !== 'suggested_total' && key !== 'inbox_count'
            )
            .flatMap(([, tasks]) => uids(tasks));

    it('lists a task due that day in due', async () => {
        const task = await makeTask({ due_date: dayStart(today) });
        const res = await getDay({ date: today });

        expect(res.status).toBe(200);
        expect(res.body.date).toBe(today);
        expect(res.body.is_today).toBe(true);
        expect(uids(res.body.due)).toEqual([task.uid]);
        expect(res.body.due[0]).toEqual(
            expect.objectContaining({
                uid: task.uid,
                name: 'A task',
                due_date: today,
                status: expect.anything(),
            })
        );
    });

    it('keeps a task planned that day only in the plan', async () => {
        const task = await makeTask({ due_date: dayStart(today) });
        await plan(today, [{ op: 'add', task_uid: task.uid }]);

        const res = await getDay({ date: today });
        expect(res.body.plan.items.map((item) => item.task_uid)).toEqual([
            task.uid,
        ]);
        expect(uids(res.body.due)).toEqual([]);
    });

    it('leaves a task due today but planned tomorrow out of due and overdue', async () => {
        const task = await makeTask({ due_date: dayStart(today) });
        await plan(tomorrow, [{ op: 'add', task_uid: task.uid }]);

        const res = await getDay({ date: today });
        expect(uids(res.body.due)).toEqual([]);
        expect(uids(res.body.overdue)).toEqual([]);
        expect(res.body.plan).toBeNull();
    });

    it('keeps a task due today that was only planned on a past day', async () => {
        const task = await makeTask({ due_date: dayStart(today) });
        await plan(yesterday, [{ op: 'add', task_uid: task.uid }]);

        const res = await getDay({ date: today });
        expect(uids(res.body.due)).toEqual([task.uid]);
    });

    it('lists an overdue task in overdue on today only', async () => {
        const task = await makeTask({ due_date: dayStart(yesterday) });

        const onToday = await getDay({ date: today });
        expect(uids(onToday.body.overdue)).toEqual([task.uid]);
        expect(uids(onToday.body.due)).toEqual([]);

        const onTomorrow = await getDay({ date: tomorrow });
        expect(onTomorrow.body.is_today).toBe(false);
        expect(onTomorrow.body.overdue).toEqual([]);
        expect(onTomorrow.body.suggestions).toBeNull();
    });

    it('does not list an overdue task planned on a future day', async () => {
        const task = await makeTask({ due_date: dayStart(yesterday) });
        await plan(tomorrow, [{ op: 'add', task_uid: task.uid }]);

        const res = await getDay({ date: today });
        expect(uids(res.body.overdue)).toEqual([]);
    });

    it('lists an overdue task planned on a future day in overdue_planned with its nearest day', async () => {
        const task = await makeTask({ due_date: dayStart(yesterday) });
        const later = dayOf(3);
        await plan(later, [{ op: 'add', task_uid: task.uid }]);
        await plan(tomorrow, [{ op: 'add', task_uid: task.uid }]);

        const res = await getDay({ date: today });
        expect(uids(res.body.overdue_planned)).toEqual([task.uid]);
        expect(res.body.overdue_planned[0].planned_date).toBe(tomorrow);
        expect(allSuggestionUids(res.body.suggestions)).not.toContain(task.uid);

        const onTomorrow = await getDay({ date: tomorrow });
        expect(onTomorrow.body.overdue_planned).toEqual([]);
    });

    it('lists a task completed that day, not in its plan, under completed', async () => {
        const done = await makeTask({
            status: Task.STATUS.DONE,
            completed_at: new Date(),
        });
        const planned = await makeTask({
            status: Task.STATUS.DONE,
            completed_at: new Date(),
        });
        await plan(today, [{ op: 'add', task_uid: planned.uid }]);

        const res = await getDay({ date: today });
        expect(uids(res.body.completed)).toEqual([done.uid]);
    });

    it('never repeats a task across the day lists and suggestions', async () => {
        const planned = await makeTask({
            due_date: dayStart(today),
            in_view_at: new Date(),
        });
        const due = await makeTask({ due_date: dayStart(today) });
        const overdue = await makeTask({
            due_date: dayStart(yesterday),
            in_view_at: new Date(),
        });
        const tag = await Tag.create({ name: 'Today', user_id: user.id });
        const tagged = await makeTask({});
        await tagged.addTag(tag);
        const free = await makeTask({ in_view_at: new Date() });
        await plan(today, [{ op: 'add', task_uid: planned.uid }]);

        const res = await getDay({ date: today });
        const onPage = [
            ...res.body.plan.items.map((item) => item.task_uid),
            ...uids(res.body.due),
            ...uids(res.body.overdue),
        ];
        expect(onPage.sort()).toEqual(
            [planned.uid, due.uid, overdue.uid].sort()
        );
        const suggestions = allSuggestionUids(res.body.suggestions);
        expect(suggestions).toContain(free.uid);
        expect(suggestions).toContain(tagged.uid);
        for (const uid of [planned.uid, due.uid, overdue.uid]) {
            expect(suggestions).not.toContain(uid);
        }
        expect(new Set(suggestions).size).toBe(suggestions.length);
    });

    it('has the same etag as GET /api/daily-plan', async () => {
        const task = await makeTask({});
        await plan(today, [{ op: 'add', task_uid: task.uid }]);

        const day = await getDay({ date: today });
        const planRes = await agent
            .get('/api/daily-plan')
            .query({ date: today });
        expect(day.body.etag).toBeTruthy();
        expect(day.body.etag).toBe(planRes.body.etag);
        expect(day.headers.etag).toBe(`"${planRes.body.etag}"`);
        expect(day.body.plan).toEqual(planRes.body.plan);
        expect(day.body.day_hours).toEqual(planRes.body.day_hours);
        expect(day.body.focus_blocks_of_day).toEqual(
            planRes.body.focus_blocks_of_day
        );
    });

    it('never lists another user tasks', async () => {
        const other = await createTestUser({
            email: 'day-other@example.com',
            timezone: TZ,
        });
        await Task.create({
            name: 'Not mine',
            user_id: other.id,
            due_date: dayStart(today),
            in_view_at: new Date(),
        });
        const mine = await makeTask({ due_date: dayStart(today) });

        const res = await getDay({ date: today });
        expect(uids(res.body.due)).toEqual([mine.uid]);
        const everything = [
            ...res.body.due,
            ...res.body.overdue,
            ...res.body.completed,
            ...Object.values(res.body.suggestions).flatMap((list) =>
                Array.isArray(list) ? list : []
            ),
        ];
        expect(everything.map((task) => task.name)).not.toContain('Not mine');
    });

    it('picks the day in the user timezone', async () => {
        const auckland = 'Pacific/Auckland';
        const aucklandUser = await createTestUser({
            email: 'day-auckland@example.com',
            timezone: auckland,
        });
        const aucklandAgent = request.agent(app);
        await aucklandAgent.post('/api/login').send({
            email: 'day-auckland@example.com',
            password: 'password123',
        });
        const aucklandTomorrow = dayOf(1, auckland);
        const task = await Task.create({
            name: 'Auckland tomorrow',
            user_id: aucklandUser.id,
            due_date: dayStart(aucklandTomorrow, auckland),
        });

        const res = await aucklandAgent
            .get('/api/daily-plan/day')
            .query({ date: aucklandTomorrow });
        expect(res.status).toBe(200);
        expect(res.body.date).toBe(aucklandTomorrow);
        expect(uids(res.body.due)).toEqual([task.uid]);

        const current = await aucklandAgent.get('/api/daily-plan/day');
        expect(current.body.date).toBe(dayOf(0, auckland));
    });

    it('returns the subtasks of planned and due tasks', async () => {
        const parent = await Task.create({
            name: 'Review',
            user_id: user.id,
            due_date: new Date(),
            status: 0,
        });
        await Task.create({
            name: 'Read it',
            user_id: user.id,
            parent_task_id: parent.id,
            status: 0,
        });
        const res = await agent.get('/api/daily-plan/day');
        expect(res.status).toBe(200);
        const found = [
            ...res.body.due,
            ...(res.body.plan?.items ?? []).map((item) => item.task),
        ].find((task) => task.uid === parent.uid);
        expect(found.subtasks.map((sub) => sub.name)).toEqual(['Read it']);
    });

    it('lists a subtask due that day, with its parent', async () => {
        const parent = await Task.create({
            name: 'Review the PR',
            user_id: user.id,
            status: 0,
        });
        const sub = await Task.create({
            name: 'Read the description',
            user_id: user.id,
            parent_task_id: parent.id,
            due_date: new Date(),
            status: 0,
        });
        const res = await agent.get('/api/daily-plan/day');
        const found = res.body.due.find((task) => task.uid === sub.uid);
        expect(found).toBeDefined();
        expect(found.parent_task.name).toBe('Review the PR');
    });
});

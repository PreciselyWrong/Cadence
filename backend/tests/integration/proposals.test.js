'use strict';

// Agent proposals (docs/47-proposals.md): Cadence computes the facts, an
// agent answers through a plugin event and the API key, the user applies the
// checked changes.
const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const {
    Area,
    Goal,
    Notification,
    Project,
    Proposal,
    Task,
} = require('../../models');
const dispatcher = require('../../modules/webhooks/dispatcher');
const dailyPlan = require('../../modules/daily-plan/service');
const { toolsFor } = require('../../modules/triage/actions');
const { createTestUser } = require('../helpers/testUtils');

describe('proposals', () => {
    let user;
    let agent;
    let run;
    let emit;
    let today;
    let dueSoon;
    let planned;
    let apiKey;

    const day = (offset) =>
        moment.tz(today, 'UTC').add(offset, 'days').format('YYYY-MM-DD');
    const requested = () =>
        emit.mock.calls.filter(([, event]) => event === 'proposal.requested');
    const answerAs = (uid, body) =>
        request(app)
            .post(`/api/proposals/${uid}/answer`)
            .set('Authorization', `Bearer ${apiKey}`)
            .send(body);

    beforeEach(async () => {
        user = await createTestUser({
            email: 'proposals@example.com',
            timezone: 'UTC',
        });
        today = moment.tz('UTC').format('YYYY-MM-DD');
        run = toolsFor(user);
        emit = jest.spyOn(dispatcher, 'emit').mockResolvedValue([]);
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
        const key = await agent
            .post('/api/profile/api-keys')
            .send({ name: 'Agent' });
        apiKey = key.body.token;

        dueSoon = JSON.parse(
            (
                await run('create_task', {
                    name: 'Préparer le devis',
                    due_date: day(2),
                })
            ).content[0].text
        );
        planned = JSON.parse(
            (await run('create_task', { name: 'Ranger le garage' })).content[0]
                .text
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const taskUid = (created) => created.task?.uid ?? created.uid;

    it('creates a week proposal, asks the agent once, and keeps it pending', async () => {
        const first = await agent.post('/api/proposals').send({
            kind: 'week',
            start: today,
            end: day(6),
        });
        expect(first.status).toBe(201);
        expect(first.body).toEqual({
            uid: expect.any(String),
            status: 'pending',
        });

        const second = await agent
            .post('/api/proposals')
            .send({ kind: 'week' });
        expect(second.status).toBe(200);
        expect(second.body.uid).toBe(first.body.uid);
        expect(requested()).toHaveLength(1);

        const [, , payload] = requested()[0];
        expect(payload.data).toMatchObject({
            uid: first.body.uid,
            kind: 'week',
        });
        expect(payload.data.facts.period).toEqual({
            start: today,
            end: day(6),
        });
        expect(payload.data.facts.days).toHaveLength(7);
        expect(payload.data.facts.stamps).toBeUndefined();
        expect(payload.data.facts.tasks.map((t) => t.uid)).toContain(
            taskUid(dueSoon)
        );
    });

    it('refuses a period over 14 days and an unknown kind', async () => {
        const long = await agent.post('/api/proposals').send({
            kind: 'week',
            start: today,
            end: day(20),
        });
        expect(long.status).toBe(400);
        const unknown = await agent
            .post('/api/proposals')
            .send({ kind: 'month' });
        expect(unknown.status).toBe(400);
        expect(requested()).toHaveLength(0);
    });

    it('takes the agent answer through the API key, validates it and notifies', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });

        const answered = await answerAs(created.uid, {
            answer: {
                headline: 'Mardi est libre',
                subtitle: 'Deux retards replacés.',
                changes: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(1),
                        reason: 'libre',
                    },
                    { task_uid: 'unknown', op: 'drop', reason: 'not in facts' },
                ],
            },
        });
        expect(answered.status).toBe(200);
        expect(answered.body).toMatchObject({ status: 'ready', error: null });
        expect(answered.body.answer).toMatchObject({
            headline: 'Mardi est libre',
            subtitle: 'Deux retards replacés.',
        });
        expect(answered.body.answer.changes).toHaveLength(1);

        const notes = await Notification.findAll({
            where: { user_id: user.id, type: 'proposal' },
        });
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({
            title: 'Ta semaine est prête',
            message: 'Mardi est libre',
            data: { proposal_uid: created.uid, kind: 'week' },
        });
        // The phone and the desktop stream only publish these sources.
        expect(notes[0].sources).toEqual(
            expect.arrayContaining(['mobile', 'desktop'])
        );

        const ready = await agent.get('/api/proposals?status=ready');
        expect(ready.body.proposals.map((p) => p.uid)).toEqual([created.uid]);
    });

    it('marks the proposal failed with a short code when the answer is unusable', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        const failed = await answerAs(created.uid, { answer: 'not an object' });
        expect(failed.body).toMatchObject({
            status: 'failed',
            error: 'bad_answer',
        });

        const headless = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        const noHeadline = await answerAs(headless.body.uid, {
            answer: {
                changes: [
                    { task_uid: taskUid(dueSoon), op: 'later', reason: 'r' },
                ],
            },
        });
        expect(noHeadline.body).toMatchObject({
            status: 'failed',
            error: 'bad_answer',
        });
        const failedNote = await Notification.findOne({
            where: {
                user_id: user.id,
                type: 'proposal',
                title: 'Ta semaine n’a pas pu être préparée',
            },
        });
        expect(failedNote).not.toBeNull();
        expect(failedNote.message).toBeNull();

        const explicit = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        expect(explicit.status).toBe(201);
        const agentDown = await answerAs(explicit.body.uid, {
            error: 'Timeout!',
        });
        expect(agentDown.body).toMatchObject({
            status: 'failed',
            error: 'agent_error',
        });
    });

    it('applies only the checked changes it is asked to, through the write paths', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        await answerAs(created.uid, {
            answer: {
                headline: 'Deux tâches',
                changes: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(1),
                        reason: 'libre',
                    },
                    {
                        task_uid: taskUid(planned),
                        op: 'this_week',
                        reason: 'cette semaine',
                    },
                ],
            },
        });

        const refused = await agent
            .post(`/api/proposals/${created.uid}/apply`)
            .send({ task_uids: ['someone-else'] });
        expect(refused.status).toBe(400);

        const applied = await agent
            .post(`/api/proposals/${created.uid}/apply`)
            .send({ task_uids: [taskUid(dueSoon)] });
        expect(applied.status).toBe(200);
        expect(applied.body).toEqual({
            uid: created.uid,
            status: 'applied',
            results: [{ task_uid: taskUid(dueSoon), state: 'applied' }],
        });

        const plan = await dailyPlan.getPlan(user, day(1));
        expect(plan.plan.items.map((item) => item.task_uid)).toContain(
            taskUid(dueSoon)
        );
        const dueRow = await Task.findOne({ where: { uid: taskUid(dueSoon) } });
        expect(dueRow.due_date).not.toBeNull();
        expect(dueRow.week_of).toBeNull();
        const plannedRow = await Task.findOne({
            where: { uid: taskUid(planned) },
        });
        expect(plannedRow.week_of).toBeNull();
    });

    it('sends a reply back to the agent with the same facts and the previous answer', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        await answerAs(created.uid, {
            answer: { headline: 'Première version.' },
        });

        const replied = await agent
            .post(`/api/proposals/${created.uid}/reply`)
            .send({ text: 'Je ne travaille pas mardi.' });
        expect(replied.body).toMatchObject({
            status: 'pending',
            reply_text: 'Je ne travaille pas mardi.',
        });
        const last = requested().at(-1)[2].data;
        expect(last).toMatchObject({
            uid: created.uid,
            reply: 'Je ne travaille pas mardi.',
            previous_answer: { headline: 'Première version.' },
        });
        expect(last.facts.stamps).toBeUndefined();
    });

    it('dismisses a proposal that is not applied yet', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        const dismissed = await agent.post(
            `/api/proposals/${created.uid}/dismiss`
        );
        expect(dismissed.body).toEqual({
            uid: created.uid,
            status: 'dismissed',
        });
        const again = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        expect(again.status).toBe(201);
    });

    it('does not show one user a proposal of another', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        const other = await createTestUser({
            email: 'other-proposals@example.com',
            timezone: 'UTC',
        });
        const otherAgent = request.agent(app);
        await otherAgent
            .post('/api/login')
            .send({ email: other.email, password: 'password123' });
        const res = await otherAgent.get(`/api/proposals/${created.uid}`);
        expect(res.status).toBe(404);
    });

    describe('a proposal whose agent never answers', () => {
        // Leaves the proposal's last change this many minutes in the past.
        const backdate = (uid, minutes) =>
            Proposal.sequelize.query(
                'UPDATE proposals SET updated_at = :at WHERE uid = :uid',
                {
                    replacements: {
                        at: moment.utc().subtract(minutes, 'minutes').toDate(),
                        uid,
                    },
                }
            );
        const weekBody = () => ({ kind: 'week', start: today, end: day(6) });

        it('is failed with timeout, and a new request replaces it', async () => {
            const stale = await agent.post('/api/proposals').send(weekBody());
            await backdate(stale.body.uid, 11);

            const fresh = await agent.post('/api/proposals').send(weekBody());
            expect(fresh.status).toBe(201);
            expect(fresh.body.uid).not.toBe(stale.body.uid);
            expect(requested()).toHaveLength(2);

            const old = await agent.get(`/api/proposals/${stale.body.uid}`);
            expect(old.body).toMatchObject({
                status: 'failed',
                error: 'timeout',
            });
        });

        it('is reported as timed out when read', async () => {
            const { body: created } = await agent
                .post('/api/proposals')
                .send(weekBody());
            await backdate(created.uid, 11);

            const res = await agent.get(`/api/proposals/${created.uid}`);
            expect(res.body).toMatchObject({
                status: 'failed',
                error: 'timeout',
            });
            const listed = await agent.get('/api/proposals?status=failed');
            expect(listed.body.proposals.map((p) => p.uid)).toEqual([
                created.uid,
            ]);
        });

        it('refuses a late answer with 409', async () => {
            const { body: created } = await agent
                .post('/api/proposals')
                .send(weekBody());
            await backdate(created.uid, 11);

            const late = await answerAs(created.uid, {
                answer: { headline: 'Trop tard.' },
            });
            expect(late.status).toBe(409);
            const res = await agent.get(`/api/proposals/${created.uid}`);
            expect(res.body).toMatchObject({
                status: 'failed',
                error: 'timeout',
            });
        });

        it('keeps a recent pending proposal', async () => {
            const { body: created } = await agent
                .post('/api/proposals')
                .send(weekBody());
            await backdate(created.uid, 9);
            const again = await agent.post('/api/proposals').send(weekBody());
            expect(again.status).toBe(200);
            expect(again.body.uid).toBe(created.uid);
        });
    });

    it('builds a review, reuses unchanged judgements and applies a chosen decision', async () => {
        await run('update_task', { id: taskUid(planned), later: true });

        const first = await agent
            .post('/api/proposals')
            .send({ kind: 'review' });
        expect(first.status).toBe(201);
        const [, , payload] = requested().at(-1);
        expect(payload.data.kind).toBe('review');
        expect(payload.data.facts.items.map((i) => i.uid)).toEqual([
            taskUid(planned),
        ]);

        const answered = await answerAs(first.body.uid, {
            answer: {
                headline: 'Un élément',
                subtitle: 'À garder en vue.',
                items: [
                    {
                        task_uid: taskUid(planned),
                        choice: 'in_view',
                        reason: 'à garder en vue',
                    },
                ],
            },
        });
        expect(answered.body.status).toBe('ready');

        const before = requested().length;
        const second = await agent
            .post('/api/proposals')
            .send({ kind: 'review' });
        expect(second.status).toBe(201);
        expect(second.body.status).toBe('ready');
        expect(requested()).toHaveLength(before);
        const reused = await agent.get(`/api/proposals/${second.body.uid}`);
        expect(reused.body.answer.items).toEqual([
            {
                task_uid: taskUid(planned),
                choice: 'in_view',
                reason: 'à garder en vue',
                cached: true,
            },
        ]);

        const applied = await agent
            .post(`/api/proposals/${second.body.uid}/apply`)
            .send({
                decisions: [{ task_uid: taskUid(planned), choice: 'in_view' }],
            });
        expect(applied.body.results).toEqual([
            { task_uid: taskUid(planned), state: 'applied' },
        ]);
        const row = await Task.findOne({ where: { uid: taskUid(planned) } });
        expect(row.in_view_at).not.toBeNull();
    });
    it('lets the user decide any listed task, and keep does nothing', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        await answerAs(created.uid, { answer: { headline: 'Rien à changer' } });

        const kept = await agent
            .post(`/api/proposals/${created.uid}/apply`)
            .send({ decisions: [{ task_uid: taskUid(dueSoon), op: 'keep' }] });
        expect(kept.status).toBe(200);
        expect(kept.body.results).toEqual([]);

        const applied = await agent
            .post(`/api/proposals/${created.uid}/apply`)
            .send({
                decisions: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(1),
                    },
                ],
            });
        expect(applied.status).toBe(200);
        expect(applied.body.results).toEqual([
            { task_uid: taskUid(dueSoon), state: 'applied' },
        ]);
        const plan = await dailyPlan.getPlan(user, day(1));
        expect(plan.plan.items.map((item) => item.task_uid)).toContain(
            taskUid(dueSoon)
        );
    });

    it('refuses a decision on a task that is not in the facts, or a date out of the window', async () => {
        const { body: created } = await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        await answerAs(created.uid, { answer: { headline: 'Rien' } });

        const notListed = await agent
            .post(`/api/proposals/${created.uid}/apply`)
            .send({
                decisions: [{ task_uid: taskUid(planned), op: 'later' }],
            });
        expect(notListed.status).toBe(400);

        const tooLate = await agent
            .post(`/api/proposals/${created.uid}/apply`)
            .send({
                decisions: [
                    { task_uid: taskUid(dueSoon), op: 'due', date: day(37) },
                ],
            });
        expect(tooLate.status).toBe(400);

        const row = await Task.findOne({ where: { uid: taskUid(dueSoon) } });
        expect(row.due_date).not.toBeNull();
    });

    it('sends the goals, areas and projects as facts', async () => {
        const area = await Area.create({ user_id: user.id, name: 'Santé' });
        const goal = await Goal.create({
            user_id: user.id,
            title: 'Courir un semi',
            status: 'active',
            horizon: 'season',
            target_date: day(40),
            area_id: area.id,
        });
        await Project.create({
            user_id: user.id,
            name: 'Cuisine rénovée',
            status: 'in_progress',
            area_id: area.id,
        });
        await Task.update(
            { goal_id: goal.id },
            { where: { uid: taskUid(dueSoon) } }
        );
        await agent
            .post('/api/proposals')
            .send({ kind: 'week', start: today, end: day(6) });
        const { facts } = requested().at(-1)[2].data;
        expect(facts).not.toHaveProperty('about');
        expect(facts.areas).toEqual(['Santé']);
        expect(facts.goals).toEqual([
            {
                uid: goal.uid,
                title: 'Courir un semi',
                due: day(40),
                progress: 0,
            },
        ]);
        expect(facts.projects).toEqual([
            { name: 'Cuisine rénovée', area: 'Santé' },
        ]);
        expect(
            facts.tasks.find((t) => t.uid === taskUid(dueSoon))
        ).toMatchObject({
            goal: 'Courir un semi',
            area: 'Santé',
        });
    });

    describe('send with notes', () => {
        let second;

        beforeEach(async () => {
            second = JSON.parse(
                (
                    await run('create_task', {
                        name: 'Relire le contrat',
                        due_date: day(3),
                    })
                ).content[0].text
            );
        });

        const sendAs = (uid, body) =>
            agent.post(`/api/proposals/${uid}/send`).send(body);

        const weekWithAnswer = async (changes) => {
            const { body: created } = await agent
                .post('/api/proposals')
                .send({ kind: 'week', start: today, end: day(6) });
            await answerAs(created.uid, {
                answer: { headline: 'Deux tâches', changes },
            });
            return created.uid;
        };

        it('sends a task to next week, this month or next month', async () => {
            const { body: created } = await agent
                .post('/api/proposals')
                .send({ kind: 'week', start: today, end: day(6) });
            await answerAs(created.uid, { answer: { headline: 'Horizons' } });
            const sent = await agent
                .post(`/api/proposals/${created.uid}/send`)
                .send({
                    decisions: [
                        { task_uid: taskUid(dueSoon), op: 'next_week' },
                        { task_uid: taskUid(second), op: 'next_month' },
                    ],
                });
            expect(sent.status).toBe(200);
            expect(sent.body.results.map((r) => r.state)).toEqual([
                'applied',
                'applied',
            ]);
            const week = await Task.findOne({
                where: { uid: taskUid(dueSoon) },
            });
            expect(week.week_of).not.toBeNull();
            const month = await Task.findOne({
                where: { uid: taskUid(second) },
            });
            expect(month.month_of).not.toBeNull();
            expect(month.week_of).toBeNull();
        });

        it('applies the decisions only when no task has a note', async () => {
            const uid = await weekWithAnswer([
                {
                    task_uid: taskUid(dueSoon),
                    op: 'plan_day',
                    date: day(1),
                    reason: 'libre',
                },
            ]);
            const sent = await sendAs(uid, {
                decisions: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(1),
                    },
                    { task_uid: taskUid(second), op: 'keep' },
                ],
                notes: [],
            });
            expect(sent.status).toBe(200);
            expect(sent.body).toEqual({
                uid,
                status: 'applied',
                results: [{ task_uid: taskUid(dueSoon), state: 'applied' }],
            });
            const plan = await dailyPlan.getPlan(user, day(1));
            expect(plan.plan.items.map((item) => item.task_uid)).toContain(
                taskUid(dueSoon)
            );
            expect(requested()).toHaveLength(1);
        });

        it('applies the other decisions now and sends only the noted tasks back for a second pass', async () => {
            const uid = await weekWithAnswer([
                {
                    task_uid: taskUid(dueSoon),
                    op: 'plan_day',
                    date: day(1),
                    reason: 'libre',
                },
                {
                    task_uid: taskUid(second),
                    op: 'later',
                    reason: 'pas urgent',
                },
            ]);
            const sent = await sendAs(uid, {
                decisions: [{ task_uid: taskUid(second), op: 'later' }],
                notes: [
                    {
                        task_uid: taskUid(dueSoon),
                        text: '  Seulement après le devis  ',
                    },
                ],
            });
            expect(sent.status).toBe(200);
            expect(sent.body).toMatchObject({
                uid,
                status: 'pending',
                round: 2,
                results: [{ task_uid: taskUid(second), state: 'applied' }],
            });

            const dueRow = await Task.findOne({
                where: { uid: taskUid(dueSoon) },
            });
            expect(dueRow.week_of).toBeNull();

            const last = requested().at(-1)[2].data;
            expect(last).toMatchObject({
                uid,
                kind: 'week',
                round: 2,
                notes: [
                    {
                        task_uid: taskUid(dueSoon),
                        text: 'Seulement après le devis',
                    },
                ],
                previous_answer: {
                    changes: [
                        {
                            task_uid: taskUid(dueSoon),
                            op: 'plan_day',
                            date: day(1),
                            reason: 'libre',
                        },
                    ],
                },
            });
            expect(last.facts.tasks.map((task) => task.uid)).toEqual([
                taskUid(dueSoon),
            ]);
            expect(last.facts.period).toEqual({ start: today, end: day(6) });
            expect(last.facts.days).toHaveLength(7);
            expect(last.facts.stamps).toBeUndefined();
            expect(last.facts.round).toBeUndefined();
        });

        it('refuses a task that is both decided and noted, and a send with nothing in it', async () => {
            const uid = await weekWithAnswer([
                {
                    task_uid: taskUid(dueSoon),
                    op: 'later',
                    reason: 'r',
                },
            ]);
            const overlap = await sendAs(uid, {
                decisions: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(1),
                    },
                ],
                notes: [{ task_uid: taskUid(dueSoon), text: 'x' }],
            });
            expect(overlap.status).toBe(400);
            const empty = await sendAs(uid, { decisions: [], notes: [] });
            expect(empty.status).toBe(400);
            const plan = await dailyPlan.getPlan(user, day(1));
            expect(plan?.plan?.items ?? []).toEqual([]);
            expect(requested()).toHaveLength(1);
        });

        it('keeps a round-two answer to the noted tasks, then applies it with /send', async () => {
            const uid = await weekWithAnswer([
                {
                    task_uid: taskUid(dueSoon),
                    op: 'plan_day',
                    date: day(1),
                    reason: 'libre',
                },
            ]);
            await sendAs(uid, {
                notes: [{ task_uid: taskUid(dueSoon), text: 'Mardi non' }],
            });
            const answered = await answerAs(uid, {
                answer: {
                    headline: 'Mercredi',
                    changes: [
                        {
                            task_uid: taskUid(second),
                            op: 'drop',
                            reason: 'hors sujet',
                        },
                        {
                            task_uid: taskUid(dueSoon),
                            op: 'plan_day',
                            date: day(2),
                            reason: 'mercredi',
                        },
                    ],
                },
            });
            expect(answered.body).toMatchObject({ status: 'ready', round: 2 });
            expect(answered.body.answer.changes).toEqual([
                {
                    task_uid: taskUid(dueSoon),
                    op: 'plan_day',
                    date: day(2),
                    reason: 'mercredi',
                },
            ]);

            const otherTask = await sendAs(uid, {
                decisions: [{ task_uid: taskUid(second), op: 'drop' }],
            });
            expect(otherTask.status).toBe(400);

            const applied = await sendAs(uid, {
                decisions: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(2),
                    },
                ],
            });
            expect(applied.status).toBe(200);
            expect(applied.body).toMatchObject({ status: 'applied' });
            const plan = await dailyPlan.getPlan(user, day(2));
            expect(plan.plan.items.map((item) => item.task_uid)).toContain(
                taskUid(dueSoon)
            );
        });
    });

    describe('send with answers', () => {
        const questions = [
            {
                id: 'mardi',
                text: 'Tu travailles mardi ?',
                choices: ['Oui', 'Non'],
            },
            { id: 'soir', text: 'Soirs libres ?', choices: ['Oui'] },
        ];

        const sendAs = (uid, body) =>
            agent.post(`/api/proposals/${uid}/send`).send(body);
        const decidedEvents = () =>
            emit.mock.calls.filter(([, event]) => event === 'proposal.decided');

        const weekWithQuestions = async () => {
            const { body: created } = await agent
                .post('/api/proposals')
                .send({ kind: 'week', start: today, end: day(6) });
            await answerAs(created.uid, {
                answer: {
                    headline: 'Ta semaine',
                    questions,
                    changes: [
                        {
                            task_uid: taskUid(dueSoon),
                            op: 'plan_day',
                            date: day(1),
                            reason: 'libre',
                        },
                    ],
                },
            });
            return created.uid;
        };

        it('applies the decisions and emits the answers without asking the agent again', async () => {
            const uid = await weekWithQuestions();
            const sent = await sendAs(uid, {
                decisions: [
                    {
                        task_uid: taskUid(dueSoon),
                        op: 'plan_day',
                        date: day(1),
                    },
                ],
                notes: [],
                answers: [{ question_id: 'mardi', choice: 'Non' }],
            });
            expect(sent.status).toBe(200);
            expect(sent.body).toEqual({
                uid,
                status: 'applied',
                results: [{ task_uid: taskUid(dueSoon), state: 'applied' }],
            });
            const plan = await dailyPlan.getPlan(user, day(1));
            expect(plan.plan.items.map((item) => item.task_uid)).toContain(
                taskUid(dueSoon)
            );
            expect(requested()).toHaveLength(1);
            expect(decidedEvents()).toHaveLength(1);
            expect(decidedEvents()[0][2].data).toEqual({
                uid,
                kind: 'week',
                answers: [{ question_id: 'mardi', choice: 'Non' }],
            });
        });

        it('with answers only, applies nothing new and marks the proposal applied', async () => {
            const uid = await weekWithQuestions();
            const sent = await sendAs(uid, {
                answers: [{ question_id: 'soir', choice: 'Oui' }],
            });
            expect(sent.status).toBe(200);
            expect(sent.body).toEqual({ uid, status: 'applied', results: [] });
            const row = await Proposal.findOne({ where: { uid } });
            expect(row.status).toBe('applied');
            expect(requested()).toHaveLength(1);
            expect(decidedEvents()[0][2].data.answers).toEqual([
                { question_id: 'soir', choice: 'Oui' },
            ]);
        });

        it('with notes, sends the answers with the second pass and emits no decision', async () => {
            const uid = await weekWithQuestions();
            const sent = await sendAs(uid, {
                decisions: [],
                notes: [{ task_uid: taskUid(dueSoon), text: 'Mardi non' }],
                answers: [{ question_id: 'mardi', choice: 'Non' }],
            });
            expect(sent.status).toBe(200);
            expect(sent.body).toMatchObject({
                uid,
                status: 'pending',
                round: 2,
            });
            expect(requested().at(-1)[2].data).toMatchObject({
                round: 2,
                answers: [{ question_id: 'mardi', choice: 'Non' }],
            });
            expect(decidedEvents()).toHaveLength(0);
        });

        it('refuses an answer to an unknown question, a choice that is not offered, a repeated question, or more than three', async () => {
            const uid = await weekWithQuestions();
            const unknown = await sendAs(uid, {
                answers: [{ question_id: 'inconnue', choice: 'Oui' }],
            });
            expect(unknown.status).toBe(400);
            const badChoice = await sendAs(uid, {
                answers: [{ question_id: 'soir', choice: 'Non' }],
            });
            expect(badChoice.status).toBe(400);
            const repeated = await sendAs(uid, {
                answers: [
                    { question_id: 'soir', choice: 'Oui' },
                    { question_id: 'soir', choice: 'Oui' },
                ],
            });
            expect(repeated.status).toBe(400);
            const many = await sendAs(uid, {
                answers: [
                    { question_id: 'a', choice: 'Oui' },
                    { question_id: 'b', choice: 'Oui' },
                    { question_id: 'c', choice: 'Oui' },
                    { question_id: 'd', choice: 'Oui' },
                ],
            });
            expect(many.status).toBe(400);
            const row = await Proposal.findOne({ where: { uid } });
            expect(row.status).toBe('ready');
            expect(decidedEvents()).toHaveLength(0);
            expect(requested()).toHaveLength(1);
        });
    });
});

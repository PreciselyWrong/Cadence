'use strict';

// Agent proposals (docs/47-proposals.md): Cadence computes the facts, an
// agent answers through a plugin event and the API key, the user applies the
// checked changes.
const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Notification, Proposal, Task } = require('../../models');
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
                summary: 'Mardi est libre.',
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
        expect(answered.body.answer.changes).toHaveLength(1);

        const notes = await Notification.findAll({
            where: { user_id: user.id, type: 'proposal' },
        });
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({
            title: 'Your week is ready',
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
            answer: { summary: 'Première version.' },
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
            previous_answer: { summary: 'Première version.' },
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
                answer: { summary: 'Trop tard.' },
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
                summary: 'Un élément.',
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
});

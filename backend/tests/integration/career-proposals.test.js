'use strict';

// Career proposals (docs/47-proposals.md, Career): the agent pushes one
// payload over MCP, the user applies its offers, follow-ups and tasks in
// parts, and each decision goes back to the agent as an event.
const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Notification, Proposal, Task } = require('../../models');
const dispatcher = require('../../modules/webhooks/dispatcher');
const { toolsFor } = require('../../modules/triage/actions');
const { createTestUser } = require('../helpers/testUtils');

describe('proposals › career', () => {
    let user;
    let agent;
    let run;
    let emit;
    let today;

    const payload = (fields = {}) => ({
        headline: 'Point emploi',
        subtitle: 'Une offre et une relance cette semaine',
        stats: [{ label: 'Offres', value: '1' }],
        followups: [
            {
                id: 'beta',
                title: 'Candidature Beta',
                company: 'Beta',
                applied_at: '2026-11-02',
                draft_url: 'https://mail.google.com/mail/u/0/#drafts/beta',
            },
        ],
        offers: [
            {
                id: 'acme',
                title: 'Dev back-end',
                company: 'Acme',
                location: 'Lausanne',
                url: 'https://jobs.example.com/acme',
                expires: '2026-12-01',
                fit: 'Node et SQL',
                source: 'jobseeka',
            },
        ],
        tasks: [
            { id: 'cv', name: 'Mettre à jour le CV', due_date: '2026-11-20' },
        ],
        ...fields,
    });

    const propose = (fields) => run('propose_career', payload(fields));
    const apply = (uid, decisions) =>
        agent.post(`/api/proposals/${uid}/apply`).send({ decisions });
    const decidedEvents = () =>
        emit.mock.calls.filter(([, event]) => event === 'proposal.decided');
    const tasksNamed = (name) =>
        Task.findAll({ where: { user_id: user.id, name } });
    // Tasks keep their due date as the end of that day, in UTC.
    const dayOf = (task) => moment.utc(task.due_date).format('YYYY-MM-DD');

    beforeEach(async () => {
        user = await createTestUser({
            email: 'career@example.com',
            timezone: 'UTC',
        });
        today = moment.tz('UTC').format('YYYY-MM-DD');
        run = toolsFor(user);
        emit = jest.spyOn(dispatcher, 'emit').mockResolvedValue([]);
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stores the payload as a ready career proposal and notifies the user', async () => {
        const created = JSON.parse((await propose()).content[0].text);
        const row = await Proposal.findOne({ where: { uid: created.uid } });

        expect(created.status).toBe('ready');
        expect(row.kind).toBe('career');
        expect(row.answer.headline).toBe('Point emploi');
        expect(row.answer.offers[0].id).toBe('acme');

        const note = await Notification.findOne({
            where: { user_id: user.id, type: 'proposal' },
        });
        expect(note.title).toBe('Point emploi');
        expect(note.message).toBe('Une offre et une relance cette semaine');
        expect(note.sources).toEqual(
            expect.arrayContaining(['desktop', 'mobile'])
        );
    });

    it('refuses an empty payload with a validation error, and stores nothing', async () => {
        await expect(
            run('propose_career', { headline: 'Rien', offers: [{ id: 'x' }] })
        ).rejects.toThrow('nothing valid to propose');
        expect(await Proposal.count({ where: { user_id: user.id } })).toBe(0);
    });

    it('dismisses the older ready career proposal when a new one arrives', async () => {
        const first = JSON.parse((await propose()).content[0].text);
        const second = JSON.parse(
            (await propose({ headline: 'Deuxième' })).content[0].text
        );

        const older = await Proposal.findOne({ where: { uid: first.uid } });
        expect(older.status).toBe('dismissed');

        const ready = await agent.get(
            '/api/proposals?kind=career&status=ready'
        );
        expect(ready.body.proposals).toHaveLength(1);
        expect(ready.body.proposals[0]).toEqual(
            expect.objectContaining({ uid: second.uid, status: 'ready' })
        );
    });

    it('applying an offer creates an application task with its link and expiry', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        const res = await apply(uid, [
            { kind: 'offer', id: 'acme', op: 'apply' },
        ]);

        expect(res.status).toBe(200);
        expect(res.body.results).toEqual([
            expect.objectContaining({
                kind: 'offer',
                id: 'acme',
                state: 'applied',
            }),
        ]);
        const [task] = await tasksNamed('Postuler : Dev back-end — Acme');
        expect(task.source_url).toBe('https://jobs.example.com/acme');
        expect(task.source).toBe('mcp');
        expect(dayOf(task)).toBe('2026-12-01');
        expect(task.note).toBe('Node et SQL\nLausanne');
    });

    it('keeps a partly applied proposal ready, then applied once every item is settled', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);

        const partial = await apply(uid, [
            { kind: 'offer', id: 'acme', op: 'later' },
            { kind: 'followup', id: 'beta', op: 'task' },
        ]);
        expect(partial.body.status).toBe('ready');

        const reread = await agent.get(`/api/proposals/${uid}`);
        expect(reread.body.decisions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'offer',
                    id: 'acme',
                    op: 'later',
                }),
                expect.objectContaining({
                    kind: 'followup',
                    id: 'beta',
                    op: 'task',
                }),
            ])
        );
        expect(reread.body.answer.offers[0].decision).toBe('later');
        expect(reread.body.answer.followups[0].decision).toBe('task');

        const [relance] = await tasksNamed('Relancer Beta');
        expect(dayOf(relance)).toBe(today);
        expect(relance.note).toContain(
            'https://mail.google.com/mail/u/0/#drafts/beta'
        );

        const skipped = await apply(uid, [
            { kind: 'offer', id: 'acme', op: 'skip' },
        ]);
        expect(skipped.body.status).toBe('ready');

        const last = await apply(uid, [
            { kind: 'task', id: 'cv', op: 'create', due_date: '2026-11-25' },
        ]);
        expect(last.body.status).toBe('applied');
    });

    it('creates the task of a task item with the decision date', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        await apply(uid, [
            { kind: 'task', id: 'cv', op: 'create', due_date: '2026-11-25' },
        ]);

        const [task] = await tasksNamed('Mettre à jour le CV');
        expect(dayOf(task)).toBe('2026-11-25');
    });

    it('does not create a second task for an item already settled', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        await apply(uid, [{ kind: 'offer', id: 'acme', op: 'apply' }]);
        const again = await apply(uid, [
            { kind: 'offer', id: 'acme', op: 'apply' },
        ]);

        expect(again.body.results[0].state).toBe('already_decided');
        expect(await tasksNamed('Postuler : Dev back-end — Acme')).toHaveLength(
            1
        );
    });

    it('refuses a decision on an unknown item or an operation the kind does not allow', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        const before = await Task.count({ where: { user_id: user.id } });

        const unknown = await apply(uid, [
            { kind: 'offer', id: 'nope', op: 'apply' },
        ]);
        expect(unknown.status).toBe(400);
        const wrongOp = await apply(uid, [
            { kind: 'offer', id: 'acme', op: 'done' },
        ]);
        expect(wrongOp.status).toBe(400);
        expect(await Task.count({ where: { user_id: user.id } })).toBe(before);
    });

    it('emits proposal.decided with the decisions of each apply, notes included as data', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        await apply(uid, [
            { kind: 'offer', id: 'acme', op: 'skip', note: 'Trop loin' },
        ]);

        const [[userId, event, payload]] = decidedEvents();
        expect(userId).toBe(user.id);
        expect(payload.data).toEqual({
            uid,
            kind: 'career',
            decisions: [
                expect.objectContaining({
                    kind: 'offer',
                    id: 'acme',
                    op: 'skip',
                    note: 'Trop loin',
                }),
            ],
        });
    });

    it('does not emit for an apply that recorded nothing', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        await apply(uid, [{ kind: 'offer', id: 'acme', op: 'apply' }]);
        emit.mockClear();

        await apply(uid, [{ kind: 'offer', id: 'acme', op: 'apply' }]);
        expect(decidedEvents()).toHaveLength(0);
    });

    it('does not reply to a career proposal as to a week', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        const res = await agent
            .post(`/api/proposals/${uid}/reply`)
            .send({ text: 'Plus court' });
        expect(res.status).toBe(400);
    });
});

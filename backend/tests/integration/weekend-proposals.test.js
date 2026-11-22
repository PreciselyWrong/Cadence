'use strict';

// Week-end proposals (docs/48-weekend.md): the agent pushes one ready payload
// over MCP, the user decides per slot, and capgw reports the calendar events
// back with its agent key.
const request = require('supertest');
const app = require('../../app');
const { Notification, Proposal } = require('../../models');
const dispatcher = require('../../modules/webhooks/dispatcher');
const { toolsFor } = require('../../modules/triage/actions');
const { createApiToken } = require('../../modules/users/apiTokenService');
const { createTestUser } = require('../helpers/testUtils');

describe('proposals › weekend', () => {
    let user;
    let agent;
    let run;
    let emit;

    const payload = (fields = {}) => ({
        headline: 'Week-end au soleil',
        subtitle: 'Samedi dégagé',
        days: [
            { date: '2026-11-14', weather: 'sun', min: 4, max: 11 },
            { date: '2026-11-15', weather: 'rain', min: 3, max: 6 },
        ],
        slots: [
            {
                id: 'sat-am',
                date: '2026-11-14',
                part: 'morning',
                weather: 'sun',
                temp: 9,
                recommended: true,
                activity: {
                    title: 'Marché de Morges',
                    url: 'https://example.com/marche',
                    image: 'https://example.com/marche.jpg',
                    place: 'Morges, Place du Marché',
                    travel: '20 min',
                },
            },
            {
                id: 'sun-pm',
                date: '2026-11-15',
                part: 'afternoon',
                weather: 'rain',
                temp: 5,
                activity: { title: 'Musée', start: '14:00', end: '17:00' },
            },
            {
                id: 'sat-pm',
                date: '2026-11-14',
                part: 'afternoon',
                busy: 'Foire aux livres, Penthalaz',
            },
        ],
        nearby: [
            {
                title: 'Atelier céramique',
                date: '2026-11-14',
                start: '14:00',
                place: 'La Sarraz, La Filature',
                travel: '5 min',
                url: 'https://example.com/atelier',
                image: 'https://example.com/atelier.jpg',
                note: 'Sur inscription',
            },
        ],
        elsewhere: [
            {
                place: 'Pontarlier',
                date: '2026-11-14',
                weather: 'sun',
                temp: 10,
                travel: '1 h',
            },
        ],
        ...fields,
    });

    const propose = (fields) => run('propose_weekend', payload(fields));
    const apply = (uid, decisions) =>
        agent.post(`/api/proposals/${uid}/apply`).send({ decisions });
    const decidedEvents = () =>
        emit.mock.calls.filter(([, event]) => event === 'proposal.decided');
    const readBack = async (uid) =>
        (await agent.get(`/api/proposals/${uid}`)).body;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'weekend@example.com',
            timezone: 'UTC',
        });
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

    describe('propose_weekend', () => {
        it('stores a ready weekend proposal and notifies desktop and mobile', async () => {
            const created = JSON.parse((await propose()).content[0].text);
            const row = await Proposal.findOne({ where: { uid: created.uid } });

            expect(created.status).toBe('ready');
            expect(row.kind).toBe('weekend');
            expect(row.answer.headline).toBe('Week-end au soleil');

            const note = await Notification.findOne({
                where: { user_id: user.id, type: 'proposal' },
            });
            expect(note.title).toBe('Week-end au soleil');
            expect(note.message).toBe('Samedi dégagé');
            expect(note.sources).toEqual(
                expect.arrayContaining(['desktop', 'mobile'])
            );
            expect(note.data).toEqual({
                proposal_uid: created.uid,
                kind: 'weekend',
            });
        });

        it('refuses a payload without a slot, and stores nothing', async () => {
            await expect(
                run('propose_weekend', { headline: 'Rien', slots: [] })
            ).rejects.toThrow('no slot');
            expect(await Proposal.count({ where: { user_id: user.id } })).toBe(
                0
            );
        });

        it('lists the weekend proposal under kind=weekend', async () => {
            const created = JSON.parse((await propose()).content[0].text);
            const list = await agent.get(
                '/api/proposals?kind=weekend&status=ready'
            );
            expect(list.status).toBe(200);
            expect(list.body.proposals).toEqual([
                expect.objectContaining({ uid: created.uid, kind: 'weekend' }),
            ]);
        });

        it('shows the slots with no decision yet', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            const body = await readBack(uid);
            expect(body.answer.slots[0]).toEqual(
                expect.objectContaining({
                    id: 'sat-am',
                    decision: null,
                    event: null,
                })
            );
        });
    });

    describe('apply', () => {
        it('records calendar with an event requested, skip, and completes the proposal', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);

            const partial = await apply(uid, [
                { slot_id: 'sat-am', op: 'calendar' },
            ]);
            expect(partial.status).toBe(200);
            expect(partial.body.status).toBe('ready');
            expect(partial.body.results).toEqual([
                { slot_id: 'sat-am', op: 'calendar', state: 'applied' },
            ]);

            const mid = await readBack(uid);
            expect(mid.answer.slots[0]).toEqual(
                expect.objectContaining({
                    decision: expect.objectContaining({ op: 'calendar' }),
                    event: { state: 'requested' },
                })
            );

            const done = await apply(uid, [{ slot_id: 'sun-pm', op: 'skip' }]);
            expect(done.body.status).toBe('applied');
        });

        it('keeps an other request open, with its note, and stays ready', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            const res = await apply(uid, [
                { slot_id: 'sun-pm', op: 'other', note: 'Plutôt un café' },
            ]);

            expect(res.body.status).toBe('ready');
            const body = await readBack(uid);
            expect(body.answer.slots[1]).toEqual(
                expect.objectContaining({
                    decision: expect.objectContaining({ op: 'other' }),
                })
            );
        });

        it('refuses the whole call for a busy slot, an unknown slot or a bad op', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);

            expect(
                (await apply(uid, [{ slot_id: 'sat-pm', op: 'skip' }])).status
            ).toBe(400);
            expect(
                (await apply(uid, [{ slot_id: 'nope', op: 'skip' }])).status
            ).toBe(400);
            expect(
                (
                    await apply(uid, [
                        { slot_id: 'sat-am', op: 'calendar' },
                        { slot_id: 'sun-pm', op: 'done' },
                    ])
                ).status
            ).toBe(400);

            const body = await readBack(uid);
            expect(body.answer.slots[0].decision).toBeNull();
        });

        it('refuses a slot already decided', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            await apply(uid, [{ slot_id: 'sat-am', op: 'skip' }]);

            const again = await apply(uid, [
                { slot_id: 'sat-am', op: 'calendar' },
            ]);
            expect(again.status).toBe(400);
        });

        it('emits proposal.decided with the decisions of the apply', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            await apply(uid, [{ slot_id: 'sat-am', op: 'calendar' }]);

            const [[userId, , payloadEvent]] = decidedEvents();
            expect(userId).toBe(user.id);
            expect(payloadEvent.data).toEqual({
                uid,
                kind: 'weekend',
                decisions: [
                    expect.objectContaining({
                        slot_id: 'sat-am',
                        op: 'calendar',
                    }),
                ],
            });
        });
    });

    describe('events', () => {
        it('refuses an event report from the app session', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            await apply(uid, [{ slot_id: 'sat-am', op: 'calendar' }]);

            const res = await agent
                .post(`/api/proposals/${uid}/events`)
                .send({ slot_id: 'sat-am', state: 'created' });
            expect(res.status).toBe(403);
            expect((await readBack(uid)).answer.slots[0].event).toEqual({
                state: 'requested',
            });
        });

        it('records a created event with its link from the agent key', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            await apply(uid, [{ slot_id: 'sat-am', op: 'calendar' }]);
            const { rawToken } = await createApiToken({ userId: user.id });

            const res = await request(app)
                .post(`/api/proposals/${uid}/events`)
                .set('Authorization', `Bearer ${rawToken}`)
                .send({
                    slot_id: 'sat-am',
                    state: 'created',
                    link: 'https://www.google.com/calendar/event?eid=abc',
                });
            expect(res.status).toBe(200);
            expect((await readBack(uid)).answer.slots[0].event).toEqual({
                state: 'created',
                link: 'https://www.google.com/calendar/event?eid=abc',
            });
        });

        it('records a failed event with its error, and a created one is final', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            await apply(uid, [{ slot_id: 'sat-am', op: 'calendar' }]);
            const { rawToken } = await createApiToken({ userId: user.id });
            const report = (body) =>
                request(app)
                    .post(`/api/proposals/${uid}/events`)
                    .set('Authorization', `Bearer ${rawToken}`)
                    .send(body);

            const failed = await report({
                slot_id: 'sat-am',
                state: 'failed',
                error: 'Calendrier absent',
            });
            expect(failed.status).toBe(200);
            expect((await readBack(uid)).answer.slots[0].event).toEqual({
                state: 'failed',
                error: 'Calendrier absent',
            });

            expect(
                (await report({ slot_id: 'sat-am', state: 'created' })).status
            ).toBe(409);
        });

        it('refuses a report for a slot with no requested event', async () => {
            const { uid } = JSON.parse((await propose()).content[0].text);
            await apply(uid, [{ slot_id: 'sun-pm', op: 'skip' }]);
            const { rawToken } = await createApiToken({ userId: user.id });

            const res = await request(app)
                .post(`/api/proposals/${uid}/events`)
                .set('Authorization', `Bearer ${rawToken}`)
                .send({ slot_id: 'sun-pm', state: 'created' });
            expect(res.status).toBe(400);
        });
    });

    describe('replacement', () => {
        it('carries the decisions of the replaced proposal to the slots with the same id', async () => {
            const first = JSON.parse((await propose()).content[0].text);
            const partial = await apply(first.uid, [
                { slot_id: 'sat-am', op: 'calendar' },
                { slot_id: 'sun-pm', op: 'other' },
            ]);
            expect(partial.body.status).toBe('ready');

            const second = JSON.parse(
                (
                    await propose({
                        subtitle: 'Nouvelle météo',
                        slots: [
                            payload().slots[0],
                            {
                                id: 'sun-am',
                                date: '2026-11-15',
                                part: 'morning',
                                activity: { title: 'Piscine' },
                            },
                            payload().slots[1],
                        ],
                    })
                ).content[0].text
            );

            expect(
                (await Proposal.findOne({ where: { uid: first.uid } })).status
            ).toBe('dismissed');
            const body = await readBack(second.uid);
            expect(body.status).toBe('ready');
            expect(body.answer.slots.find((s) => s.id === 'sat-am')).toEqual(
                expect.objectContaining({
                    decision: expect.objectContaining({ op: 'calendar' }),
                    event: { state: 'requested' },
                })
            );
            expect(
                body.answer.slots.find((s) => s.id === 'sun-pm').decision
            ).toBeNull();
            expect(
                body.answer.slots.find((s) => s.id === 'sun-am').decision
            ).toBeNull();

            const again = await apply(second.uid, [
                { slot_id: 'sat-am', op: 'skip' },
            ]);
            expect(again.status).toBe(400);
        });
    });

    it('does not reply to a weekend proposal as to a week', async () => {
        const { uid } = JSON.parse((await propose()).content[0].text);
        const res = await agent
            .post(`/api/proposals/${uid}/reply`)
            .send({ text: 'Plus court' });
        expect(res.status).toBe(400);
    });
    describe('on demand', () => {
        const moment = require('moment-timezone');
        const inDays = (n) => moment.utc().add(n, 'days').format('YYYY-MM-DD');
        const ask = (dates) =>
            agent.post('/api/proposals').send({ kind: 'weekend', dates });
        const requested = () =>
            emit.mock.calls.filter(
                ([, event]) => event === 'proposal.requested'
            );
        const forDates = (dates) =>
            payload({
                days: dates.map((date) => ({ date, weather: 'sun' })),
                slots: dates.map((date, i) => ({
                    id: `d${i}-am`,
                    date,
                    part: 'morning',
                    activity: { title: `Sortie ${i}` },
                })),
                nearby: [],
                elsewhere: [],
            });

        it('stores a pending request with the chosen days and asks the agent', async () => {
            const dates = [inDays(9), inDays(3)];
            const res = await ask(dates);

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('pending');
            const body = await readBack(res.body.uid);
            expect(body.kind).toBe('weekend');
            expect(body.request).toEqual({ dates: [inDays(3), inDays(9)] });
            expect(requested()).toHaveLength(1);
            expect(requested()[0][2].data).toEqual(
                expect.objectContaining({
                    uid: res.body.uid,
                    kind: 'weekend',
                    facts: { request: { dates: [inDays(3), inDays(9)] } },
                })
            );
        });

        it('refuses a request without valid days, and stores nothing', async () => {
            for (const dates of [[], [inDays(-1)], [inDays(20)]]) {
                expect((await ask(dates)).status).toBe(400);
            }
            expect(await Proposal.count({ where: { user_id: user.id } })).toBe(
                0
            );
            expect(requested()).toHaveLength(0);
        });

        it('keeps the same pending request, and replaces it for other days', async () => {
            const first = await ask([inDays(2)]);
            const again = await ask([inDays(2)]);
            expect(again.status).toBe(200);
            expect(again.body.uid).toBe(first.body.uid);

            const other = await ask([inDays(4)]);
            expect(other.status).toBe(201);
            expect(other.body.uid).not.toBe(first.body.uid);
            expect((await readBack(first.body.uid)).status).toBe('dismissed');
        });

        it('fills the pending request with the agent proposal, under the same uid', async () => {
            const dates = [inDays(2), inDays(3)];
            const ready = JSON.parse((await propose()).content[0].text);
            const pending = await ask(dates);

            const filled = JSON.parse(
                (await run('propose_weekend', forDates(dates))).content[0].text
            );

            expect(filled).toEqual({ uid: pending.body.uid, status: 'ready' });
            const body = await readBack(pending.body.uid);
            expect(body.answer.days.map((d) => d.date)).toEqual(dates);
            expect(body.request).toEqual({ dates });
            expect((await readBack(ready.uid)).status).toBe('dismissed');
            expect(await Proposal.count({ where: { user_id: user.id } })).toBe(
                2
            );
        });

        it('lists the pending request and the last weekend still shown', async () => {
            const ready = JSON.parse((await propose()).content[0].text);
            const pending = await ask([inDays(2)]);

            const list = await agent.get('/api/proposals?kind=weekend');

            expect(list.body.proposals.map((p) => [p.uid, p.status])).toEqual([
                [pending.body.uid, 'pending'],
                [ready.uid, 'ready'],
            ]);
        });

        it('takes a failure code from the agent, but no answer by that route', async () => {
            const first = await ask([inDays(2)]);
            const refused = await agent
                .post(`/api/proposals/${first.body.uid}/answer`)
                .send({ answer: { headline: 'Non' } });
            expect(refused.status).toBe(400);
            expect((await readBack(first.body.uid)).status).toBe('pending');

            const failed = await agent
                .post(`/api/proposals/${first.body.uid}/answer`)
                .send({ error: 'paused' });
            expect(failed.status).toBe(200);
            expect(await readBack(first.body.uid)).toEqual(
                expect.objectContaining({ status: 'failed', error: 'paused' })
            );
        });

        it('still lists the last weekend shown after a failed request', async () => {
            const ready = JSON.parse((await propose()).content[0].text);
            const pending = await ask([inDays(2)]);
            await agent
                .post(`/api/proposals/${pending.body.uid}/answer`)
                .send({ error: 'paused' });

            const list = await agent.get('/api/proposals?kind=weekend');

            expect(list.body.proposals.map((p) => [p.uid, p.status])).toEqual([
                [pending.body.uid, 'failed'],
                [ready.uid, 'ready'],
            ]);
        });

        it('waits an hour for the agent before failing the request', async () => {
            const { body } = await ask([inDays(2)]);
            const backdate = (minutes) =>
                Proposal.sequelize.query(
                    'UPDATE proposals SET updated_at = :at WHERE uid = :uid',
                    {
                        replacements: {
                            at: moment
                                .utc()
                                .subtract(minutes, 'minutes')
                                .toDate(),
                            uid: body.uid,
                        },
                    }
                );
            await backdate(30);
            expect((await readBack(body.uid)).status).toBe('pending');

            await backdate(61);
            const failed = await readBack(body.uid);
            expect(failed).toEqual(
                expect.objectContaining({ status: 'failed', error: 'timeout' })
            );
            const note = await Notification.findOne({
                where: { user_id: user.id, type: 'proposal' },
                order: [['id', 'DESC']],
            });
            expect(note.title).toBe('Le week-end n’a pas pu être préparé');
        });
    });
});

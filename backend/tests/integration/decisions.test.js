'use strict';

// Agent decision cards (docs/49-agent-decisions.md): proposed by an agent
// over MCP, decided by the user in a deck, reported back by code.
const request = require('supertest');
const app = require('../../app');
const { AgentDecision, Notification } = require('../../models');
const { toolsFor } = require('../../modules/triage/actions');
const decisionsReady = require('../../modules/decisions/ready');
const dispatcher = require('../../modules/webhooks/dispatcher');
const { createTestUser } = require('../helpers/testUtils');

const MINUTE = 60 * 1000;

const baseItem = (overrides = {}) => ({
    key: 'sub-netflix',
    title: 'Netflix (17,99 €/mois)',
    context: 'Aucun visionnage depuis 60 jours',
    body: 'Forfait Standard\nDernier accès : 12 septembre',
    url: 'https://www.netflix.com/account',
    choices: [
        { id: 'keep', label: 'Garder' },
        { id: 'cancel', label: 'Résilier', tone: 'danger' },
        { id: 'renegotiate', label: 'Renégocier', tone: 'primary' },
    ],
    recommended: 'cancel',
    reason: 'Inactif depuis 2 mois',
    data: { name: 'Netflix', amount: 17.99 },
    ...overrides,
});

describe('agent decisions', () => {
    let user;
    let agent;
    let run;

    const propose = async (overrides = {}) => {
        const res = await run('propose_decisions', {
            kind: 'subscription',
            kind_label: 'Abonnements',
            items: [baseItem()],
            ...overrides,
        });
        return JSON.parse(res.content[0].text);
    };

    const listMcp = async (params = {}) => {
        const res = await run('list_decisions', params);
        return JSON.parse(res.content[0].text);
    };

    const reportMcp = async (params) => {
        const res = await run('report_decision', params);
        return JSON.parse(res.content[0].text);
    };

    beforeEach(async () => {
        user = await createTestUser({ email: 'decisions@example.com' });
        run = toolsFor(user);
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('creates, updates, reopens from reviewing, and leaves done cards alone', async () => {
        expect(await propose()).toEqual({
            created: 1,
            updated: 0,
            reopened: 0,
            already_decided: 0,
            errors: [],
        });

        // Update pending card
        expect(
            await propose({
                items: [baseItem({ title: 'Netflix (19,99 €/mois)' })],
            })
        ).toEqual({
            created: 0,
            updated: 1,
            reopened: 0,
            already_decided: 0,
            errors: [],
        });

        // GET /api/decisions returns public fields without `data`, and /api/triage has decisions_count
        const getRes = await agent.get('/api/decisions');
        expect(getRes.status).toBe(200);
        expect(getRes.body.count).toBe(1);
        const card = getRes.body.items[0];
        expect(card.title).toBe('Netflix (19,99 €/mois)');
        expect(card).not.toHaveProperty('data');
        expect((await agent.get('/api/triage')).body.decisions_count).toBe(1);

        // User answers with a note -> reviewing
        const noteRes = await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'note', note: 'Vérifier avec Audrey' });
        expect(noteRes.status).toBe(200);
        expect(noteRes.body.status).toBe('reviewing');
        expect((await agent.get('/api/decisions')).body.count).toBe(0);

        // Agent proposes again -> reopened
        expect(
            await propose({
                items: [baseItem({ title: 'Netflix (confirmé avec Audrey)' })],
            })
        ).toEqual({
            created: 0,
            updated: 0,
            reopened: 1,
            already_decided: 0,
            errors: [],
        });

        // User settles with a choice -> done
        const settleRes = await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'cancel', idempotency_key: 'dec-1' });
        expect(settleRes.status).toBe(200);
        expect(settleRes.body).toMatchObject({
            uid: card.uid,
            status: 'done',
            decision: 'cancel',
            result: { state: 'requested' },
        });

        // Proposing again leaves done card alone
        expect(await propose()).toEqual({
            created: 0,
            updated: 0,
            reopened: 0,
            already_decided: 1,
            errors: [],
        });
    });

    it('reports per-item validation errors while storing valid items', async () => {
        const result = await propose({
            items: [
                baseItem({ key: 'good-1' }),
                baseItem({
                    key: 'bad-choice',
                    choices: [
                        { id: 'note', label: 'Note' },
                        { id: 'ok', label: 'OK' },
                    ],
                }),
                baseItem({ key: 'bad-rec', recommended: 'nope' }),
                baseItem({ key: 'bad-url', url: 'http://insecure.example' }),
                baseItem({
                    key: 'bad-data',
                    data: { big: 'a'.repeat(2100) },
                }),
            ],
        });
        expect(result.created).toBe(1);
        expect(result.errors).toHaveLength(4);
        expect(result.errors.map((e) => e.key)).toEqual([
            'bad-choice',
            'bad-rec',
            'bad-url',
            'bad-data',
        ]);
    });

    it('refuses >30 items at batch level', async () => {
        await expect(
            run('propose_decisions', {
                kind: 'subscription',
                kind_label: 'Abonnements',
                items: Array.from({ length: 31 }, (_, i) =>
                    baseItem({ key: `k-${i}` })
                ),
            })
        ).rejects.toThrow();
    });

    it('supports later, idempotent replay, 409 settled elsewhere, and stale deciding recovery', async () => {
        await propose();
        const card = (await agent.get('/api/decisions')).body.items[0];

        // Put off until future
        const future = new Date(Date.now() + 60 * MINUTE).toISOString();
        const laterRes = await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'later', until: future });
        expect(laterRes.status).toBe(200);
        expect(laterRes.body.status).toBe('later');
        expect((await agent.get('/api/decisions')).body.count).toBe(0);
        expect((await agent.get('/api/triage')).body.decisions_count).toBe(0);

        // When later_until is past, it shows up again
        await AgentDecision.update(
            { later_until: new Date(Date.now() - MINUTE) },
            { where: { uid: card.uid } }
        );
        expect((await agent.get('/api/decisions')).body.count).toBe(1);
        expect((await agent.get('/api/triage')).body.decisions_count).toBe(1);

        // Settle with idempotency_key
        const first = await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'cancel', idempotency_key: 'k-123' });
        expect(first.status).toBe(200);
        expect(first.body.replayed).toBeUndefined();

        const replay = await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'cancel', idempotency_key: 'k-123' });
        expect(replay.status).toBe(200);
        expect(replay.body.replayed).toBe(true);

        // Different decision -> 409 Déjà traité ailleurs.
        const conflict = await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'keep', idempotency_key: 'k-other' });
        expect(conflict.status).toBe(409);
        expect(conflict.body.error).toBe('Déjà traité ailleurs.');

        // Stale deciding (>5 min) is freed
        await propose({
            items: [baseItem({ key: 'stale-1' })],
        });
        const staleCard = (await agent.get('/api/decisions')).body.items.find(
            (i) => i.key === 'stale-1'
        );
        await AgentDecision.update(
            { status: 'deciding' },
            { where: { uid: staleCard.uid } }
        );
        // Active deciding -> 409
        const busy = await agent
            .post(`/api/decisions/${staleCard.uid}/decide`)
            .send({ decision: 'keep' });
        expect(busy.status).toBe(409);

        // Age updated_at past 5 minutes using Sequelize's date formatting
        await AgentDecision.sequelize.query(
            'UPDATE agent_decisions SET updated_at = :past WHERE uid = :uid',
            {
                replacements: {
                    past: new Date(Date.now() - 6 * MINUTE)
                        .toISOString()
                        .replace('T', ' ')
                        .replace('Z', ' +00:00'),
                    uid: staleCard.uid,
                },
            }
        );
        const recovered = await agent
            .post(`/api/decisions/${staleCard.uid}/decide`)
            .send({ decision: 'keep' });
        expect(recovered.status).toBe(200);
        expect(recovered.body.status).toBe('done');
    });

    it('emits decision.made event on decision', async () => {
        const emitSpy = jest.spyOn(dispatcher, 'emit').mockResolvedValue();
        await propose();
        const card = (await agent.get('/api/decisions')).body.items[0];
        await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'cancel' });

        expect(emitSpy).toHaveBeenCalledWith(
            user.id,
            'decision.made',
            expect.objectContaining({
                data: {
                    decision: {
                        uid: card.uid,
                        kind: 'subscription',
                        key: 'sub-netflix',
                        decision: 'cancel',
                        note: null,
                    },
                },
            })
        );
    });

    it('handles report_decision done, failed, idempotent repeat, and conflicts', async () => {
        await propose();
        const card = (await agent.get('/api/decisions')).body.items[0];

        // Not decided yet -> error (409)
        await expect(
            run('report_decision', {
                kind: 'subscription',
                key: 'sub-netflix',
                ok: true,
            })
        ).rejects.toThrow('Decision card is not decided');

        await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'cancel' });

        // Report ok: true
        const rep = await reportMcp({
            kind: 'subscription',
            key: 'sub-netflix',
            ok: true,
            url: 'https://example.com/cancelled',
        });
        expect(rep.result).toEqual({
            state: 'done',
            url: 'https://example.com/cancelled',
        });

        // Same report again -> idempotent
        const repAgain = await reportMcp({
            kind: 'subscription',
            key: 'sub-netflix',
            ok: true,
            url: 'https://example.com/cancelled',
        });
        expect(repAgain.result).toEqual(rep.result);

        // Contradicting report -> error (409)
        await expect(
            run('report_decision', {
                kind: 'subscription',
                key: 'sub-netflix',
                ok: false,
                error: 'timeout',
            })
        ).rejects.toThrow('Result already recorded');

        // Failed report on another card
        await propose({ items: [baseItem({ key: 'sub-2' })] });
        const card2 = (await agent.get('/api/decisions')).body.items.find(
            (i) => i.key === 'sub-2'
        );
        await agent
            .post(`/api/decisions/${card2.uid}/decide`)
            .send({ decision: 'cancel' });
        const repFail = await reportMcp({
            kind: 'subscription',
            key: 'sub-2',
            ok: false,
            error: 'unknown_choice',
        });
        expect(repFail.result).toEqual({
            state: 'failed',
            error: 'unknown_choice',
        });
    });

    it('filters list_decisions by kind and status and purges cards decided >30 days ago', async () => {
        await propose();
        await run('propose_decisions', {
            kind: 'docker_update',
            kind_label: 'Mises à jour',
            items: [baseItem({ key: 'img-plex', title: 'Plex 1.42' })],
        });

        const all = await listMcp();
        expect(all.items).toHaveLength(2);
        expect(all.items[0]).toHaveProperty('data');

        const onlyDocker = await listMcp({ kind: 'docker_update' });
        expect(onlyDocker.items).toHaveLength(1);
        expect(onlyDocker.items[0].kind).toBe('docker_update');

        const onlyPending = await listMcp({ status: 'pending' });
        expect(onlyPending.items).toHaveLength(2);

        // Old done card (>30 days) is purged on read
        const card = (await agent.get('/api/decisions')).body.items[0];
        await agent
            .post(`/api/decisions/${card.uid}/decide`)
            .send({ decision: 'keep' });
        const thirtyOneDaysAgo = new Date(
            Date.now() - 31 * 24 * 60 * 60 * 1000
        );
        await AgentDecision.update(
            { decided_at: thirtyOneDaysAgo },
            { where: { uid: card.uid } }
        );

        const afterPurge = await listMcp();
        expect(
            afterPurge.items.find((i) => i.uid === card.uid)
        ).toBeUndefined();
    });

    it('debounces decisions_ready notification after 2 quiet minutes', async () => {
        jest.useFakeTimers({
            doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
        });
        await propose();
        jest.advanceTimersByTime(2 * MINUTE - 1);
        await decisionsReady.idle();
        expect(
            await Notification.count({
                where: { user_id: user.id, type: 'decisions_ready' },
            })
        ).toBe(0);

        jest.advanceTimersByTime(1);
        await decisionsReady.idle();
        const notifs = await Notification.findAll({
            where: { user_id: user.id, type: 'decisions_ready' },
        });
        expect(notifs).toHaveLength(1);
        expect(notifs[0].title).toBe('1 décision à prendre');
        expect(notifs[0].data).toEqual({
            kind: 'decisions_ready',
            count: 1,
            openPath: '/triage?deck=decisions',
        });

        // Second burst dismisses unread first notification and replaces with count 2
        await propose({ items: [baseItem({ key: 'sub-spotify' })] });
        jest.advanceTimersByTime(2 * MINUTE);
        await decisionsReady.idle();

        const allNotifs = await Notification.findAll({
            where: { user_id: user.id, type: 'decisions_ready' },
            order: [['id', 'ASC']],
        });
        expect(allNotifs).toHaveLength(2);
        expect(allNotifs[0].dismissed_at).not.toBeNull();
        expect(allNotifs[1].title).toBe('2 décisions à prendre');
    });
});

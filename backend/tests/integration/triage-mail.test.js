'use strict';

// Mail cards in « À trier » (docs/43-mail-triage.md): proposed by an agent
// over MCP, decided by the user, archived in Gmail only when asked.
const request = require('supertest');
const app = require('../../app');
const { MailItem, Task } = require('../../models');
const { toolsFor } = require('../../modules/triage/actions');
const { createTestUser } = require('../helpers/testUtils');

const THREAD = '18c2f0a9b1d3e4f5';

describe('triage › mail cards', () => {
    let user;
    let agent;
    let run;

    const proposal = (fields = {}) => ({
        account: 'perso',
        thread_id: THREAD,
        from_name: 'Alice Martin',
        from_address: 'alice@example.com',
        subject: 'Devis cuisine',
        received_at: '2026-11-10T09:00:00Z',
        summary: 'Demande de valider le devis avant vendredi',
        suggestion: {
            kind: 'task',
            task_name: 'Valider le devis',
            due_date: '2026-11-14',
        },
        draft_excerpt: 'Bonjour Alice, merci pour le devis',
        gmail_url: `https://mail.google.com/mail/u/0/#inbox/${THREAD}`,
        ...fields,
    });
    const propose = async (fields) =>
        JSON.parse(
            (await run('propose_mail', proposal(fields))).content[0].text
        );
    const mailItems = async () =>
        (await agent.get('/api/triage')).body.items.filter(
            (item) => item.type === 'mail'
        );
    const decide = (uid, body) =>
        agent.post(`/api/triage/mail/${uid}/decide`).send(body);

    beforeEach(async () => {
        user = await createTestUser({ email: 'mailtriage@example.com' });
        run = toolsFor(user);
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    afterEach(() => {
        delete process.env.TUDUDI_GMAIL_MCP_URL;
        delete process.env.TUDUDI_GMAIL_MCP_TOKEN;
        jest.restoreAllMocks();
    });

    it('shows a proposed thread as one card with what the user needs', async () => {
        const { mail_uid: uid } = await propose();
        const items = await mailItems();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            key: `mail:${uid}`,
            source: 'mail',
            task_uid: null,
            action: 'decide_mail',
            reason: 'Demande de valider le devis avant vendredi',
        });
        expect(items[0].payload).toMatchObject({
            mail_uid: uid,
            from_name: 'Alice Martin',
            subject: 'Devis cuisine',
            draft_excerpt: 'Bonjour Alice, merci pour le devis',
            suggestion: { kind: 'task', task_name: 'Valider le devis' },
        });
    });

    it('keeps one card per thread, updated by a newer message', async () => {
        const first = await propose();
        const second = await propose({
            received_at: '2026-11-11T09:00:00Z',
            summary: 'Relance : le devis expire vendredi',
        });
        expect(second.mail_uid).toBe(first.mail_uid);
        const items = await mailItems();
        expect(items).toHaveLength(1);
        expect(items[0].reason).toBe('Relance : le devis expire vendredi');
    });

    it('refuses an address outside Gmail and an overlong summary', async () => {
        await expect(
            propose({ gmail_url: 'https://evil.example.com/mail.google.com/' })
        ).rejects.toThrow(/gmail_url/);
        await expect(
            propose({ gmail_url: 'javascript:alert(1)' })
        ).rejects.toThrow(/gmail_url/);
        await expect(propose({ summary: 'x'.repeat(201) })).rejects.toThrow(
            /summary/
        );
        expect(await MailItem.count()).toBe(0);
    });

    it('stores the text as given, without control characters', async () => {
        await propose({
            subject: 'Devis\u0000 [clic](https://x.example)\u0007',
        });
        const [item] = await mailItems();
        expect(item.payload.subject).toBe('Devis [clic](https://x.example)');
    });

    it('creates the task with the Gmail link in its note', async () => {
        const { mail_uid: uid } = await propose();
        const response = await decide(uid, {
            decision: 'task',
            payload: { name: 'Valider le devis cuisine' },
        });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            state: 'done',
            decision: 'task',
        });
        const task = await Task.findOne({
            where: { uid: response.body.task_uid },
        });
        expect(task.name).toBe('Valider le devis cuisine');
        expect(task.note).toContain('Demande de valider le devis');
        expect(task.note).toContain(
            `https://mail.google.com/mail/u/0/#inbox/${THREAD}`
        );
        expect(new Date(task.due_date).toISOString()).toMatch(/^2026-11-14/);
        expect(await mailItems()).toEqual([]);
    });

    it('does not create the task twice for the same order', async () => {
        const { mail_uid: uid } = await propose();
        const body = { decision: 'task', idempotency_key: 'k1' };
        expect((await decide(uid, body)).status).toBe(200);
        const again = await decide(uid, body);
        expect(again.status).toBe(200);
        expect(again.body.replayed).toBe(true);
        expect(await Task.count({ where: { user_id: user.id } })).toBe(1);
    });

    it('marks the task as coming from Gmail', async () => {
        const { mail_uid: uid } = await propose();
        const response = await decide(uid, { decision: 'task' });
        const task = await Task.findOne({
            where: { uid: response.body.task_uid },
        });
        expect(task.source).toBe('gmail');
        expect(task.source_url).toContain('https://mail.google.com/');
    });

    it('refuses an impossible date, then runs the same order once fixed', async () => {
        await expect(
            propose({ suggestion: { kind: 'task', due_date: '2026-02-31' } })
        ).rejects.toThrow(/due_date/);
        const { mail_uid: uid } = await propose();
        const bad = await decide(uid, {
            decision: 'task',
            payload: { due_date: '2026-02-31' },
            idempotency_key: 'k-retry',
        });
        expect(bad.status).toBe(400);
        const retry = await decide(uid, {
            decision: 'task',
            idempotency_key: 'k-retry',
        });
        expect(retry.status).toBe(200);
        expect(retry.body.replayed).toBeUndefined();
        expect(await Task.count({ where: { user_id: user.id } })).toBe(1);
    });

    it('runs one of two decisions sent at once, and refuses the other', async () => {
        const { mail_uid: uid } = await propose();
        const answers = await Promise.all([
            decide(uid, { decision: 'task' }),
            decide(uid, { decision: 'task' }),
            decide(uid, { decision: 'dismiss', idempotency_key: 'a' }),
        ]);
        expect(
            await Task.count({ where: { user_id: user.id } })
        ).toBeLessThanOrEqual(1);
        const done = answers.filter(
            (answer) => answer.status === 200 && !answer.body.replayed
        );
        expect(done).toHaveLength(1);
        for (const answer of answers) {
            if (answer === done[0]) continue;
            // The same decision met while the winner runs is a conflict too.
            const same =
                answer.request._data.decision === done[0].body.decision;
            expect(same ? [200, 409] : [409]).toContain(answer.status);
        }
    });

    it('does not run an old order again on a card reopened by a new message', async () => {
        const { mail_uid: uid } = await propose();
        const body = { decision: 'task', idempotency_key: 'k-old' };
        await decide(uid, body);
        await propose({
            received_at: new Date(Date.now() + 60000).toISOString(),
        });
        const again = await decide(uid, body);
        expect(again.status).toBe(200);
        expect(again.body.replayed).toBe(true);
        expect(await Task.count({ where: { user_id: user.id } })).toBe(1);
        expect(await mailItems()).toHaveLength(1);
    });

    it('frees a card left being decided by a crash', async () => {
        const { mail_uid: uid } = await propose();
        await MailItem.update({ status: 'deciding' }, { where: { uid } });
        expect((await decide(uid, { decision: 'dismiss' })).status).toBe(409);
        await MailItem.sequelize.query(
            'UPDATE mail_items SET updated_at = :at WHERE uid = :uid',
            {
                replacements: {
                    // The format Sequelize writes: UTC, explicit offset.
                    at: new Date(Date.now() - 10 * 60000)
                        .toISOString()
                        .replace('T', ' ')
                        .replace('Z', ' +00:00'),
                    uid,
                },
            }
        );
        expect((await decide(uid, { decision: 'dismiss' })).status).toBe(200);
    });

    it('drops characters that reorder or hide text', async () => {
        await propose({ subject: 'Facture‮ fdp.exe​⁦' });
        const [item] = await mailItems();
        expect(item.payload.subject).toBe('Facture fdp.exe');
    });

    it('answers 409 to another decision on a card settled elsewhere', async () => {
        const { mail_uid: uid } = await propose();
        await decide(uid, { decision: 'dismiss' });
        expect((await decide(uid, { decision: 'dismiss' })).status).toBe(200);
        expect((await decide(uid, { decision: 'task' })).status).toBe(409);
    });

    it('hides a card until later, then shows it again', async () => {
        const { mail_uid: uid } = await propose();
        await decide(uid, {
            decision: 'later',
            payload: { until: '2099-01-01T08:00:00Z' },
        });
        expect(await mailItems()).toEqual([]);
        await MailItem.update(
            { later_until: new Date('2020-01-01T08:00:00Z') },
            { where: { uid } }
        );
        expect(await mailItems()).toHaveLength(1);
    });

    it('reopens a decided thread only for a message after the decision', async () => {
        const { mail_uid: uid } = await propose();
        await decide(uid, { decision: 'dismiss' });
        await propose();
        expect(await mailItems()).toEqual([]);
        await propose({
            received_at: new Date(Date.now() + 60000).toISOString(),
        });
        expect(await mailItems()).toHaveLength(1);
    });

    it('lets the agent remove a card handled in Gmail', async () => {
        await propose();
        await run('resolve_mail', { account: 'perso', thread_id: THREAD });
        expect(await mailItems()).toEqual([]);
        const listed = JSON.parse(
            (await run('list_mail_cards', {})).content[0].text
        );
        expect(listed.cards[0]).toMatchObject({
            thread_id: THREAD,
            status: 'done',
            decision: 'resolved',
        });
    });

    it('refuses a card of someone else', async () => {
        const other = await createTestUser({ email: 'other-mail@example.com' });
        const theirs = JSON.parse(
            (await toolsFor(other)('propose_mail', proposal())).content[0].text
        );
        expect(
            (await decide(theirs.mail_uid, { decision: 'dismiss' })).status
        ).toBe(404);
    });

    it('deletes decided cards 30 days after the decision', async () => {
        const { mail_uid: uid } = await propose();
        await decide(uid, { decision: 'dismiss' });
        await MailItem.update(
            { decided_at: new Date(Date.now() - 31 * 86400000) },
            { where: { uid } }
        );
        await mailItems();
        expect(await MailItem.count({ where: { uid } })).toBe(0);
    });

    describe('v2: choices, draft, archive, note, action report', () => {
        const DRAFT_BODY = 'Bonjour Alice,\n\nJe valide le devis.';
        const draftChoice = {
            options: ['draft', 'task', 'later', 'dismiss'],
            recommended: 'draft',
            draft: { body: DRAFT_BODY },
            excerpt: 'Bonjour Alice,\nMerci pour le devis.',
        };
        const card = (fields = {}) => propose({ ...draftChoice, ...fields });
        const report = (fields) =>
            run('report_mail_action', {
                account: 'perso',
                thread_id: THREAD,
                ...fields,
            });
        const listed = async () =>
            JSON.parse((await run('list_mail_cards', {})).content[0].text)
                .cards;

        describe('contract of propose_mail', () => {
            it('returns options, recommended, draft and excerpt on the card', async () => {
                await card();
                const [item] = await mailItems();
                expect(item.payload).toMatchObject({
                    options: ['draft', 'task', 'later', 'dismiss'],
                    recommended: 'draft',
                    draft: { body: DRAFT_BODY },
                    excerpt: 'Bonjour Alice,\nMerci pour le devis.',
                });
            });

            it('derives the choices from the old suggestion when none are sent', async () => {
                await propose();
                const [item] = await mailItems();
                expect(item.payload).toMatchObject({
                    options: ['task', 'later', 'dismiss'],
                    recommended: 'task',
                    draft: null,
                    excerpt: null,
                });
            });

            it('keeps the options in the order given', async () => {
                await propose({
                    options: ['dismiss', 'later', 'task'],
                    recommended: 'later',
                });
                const [item] = await mailItems();
                expect(item.payload.options).toEqual([
                    'dismiss',
                    'later',
                    'task',
                ]);
            });

            it.each([
                ['one option', { options: ['task'], recommended: 'task' }],
                [
                    'six options',
                    {
                        options: [
                            'draft',
                            'task',
                            'event',
                            'later',
                            'archive',
                            'dismiss',
                        ],
                        recommended: 'task',
                        draft: { body: DRAFT_BODY },
                    },
                ],
                [
                    'an unknown option',
                    { options: ['task', 'reply'], recommended: 'task' },
                ],
                [
                    'a repeated option',
                    { options: ['task', 'task'], recommended: 'task' },
                ],
                [
                    'a recommendation outside the options',
                    { options: ['task', 'later'], recommended: 'dismiss' },
                ],
                [
                    'draft option without a draft body',
                    { options: ['draft', 'task'], recommended: 'draft' },
                ],
                [
                    'a draft body over 4000 characters',
                    {
                        options: ['draft', 'task'],
                        recommended: 'draft',
                        draft: { body: 'x'.repeat(4001) },
                    },
                ],
                [
                    'an empty draft body',
                    {
                        options: ['draft', 'task'],
                        recommended: 'draft',
                        draft: { body: '   ' },
                    },
                ],
                [
                    'a draft without the draft option',
                    {
                        options: ['task', 'later'],
                        recommended: 'task',
                        draft: { body: DRAFT_BODY },
                    },
                ],
                [
                    'an excerpt over 1500 characters',
                    { ...draftChoice, excerpt: 'x'.repeat(1501) },
                ],
            ])('refuses %s', async (_label, fields) => {
                await expect(propose(fields)).rejects.toThrow();
                expect(await MailItem.count()).toBe(0);
            });

            it('refuses a draft body over 4000 characters with the field named', async () => {
                await expect(
                    card({ draft: { body: 'x'.repeat(4001) } })
                ).rejects.toThrow(/draft/);
            });

            it('lists the cards for the agent with action, note and draft', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                const [entry] = await listed();
                expect(entry).toMatchObject({
                    mail_uid: uid,
                    status: 'done',
                    decision: 'draft',
                    options: ['draft', 'task', 'later', 'dismiss'],
                    recommended: 'draft',
                    draft: { body: DRAFT_BODY },
                    action: { type: 'draft', state: 'requested' },
                    note: null,
                });
            });
        });

        describe('draft decision', () => {
            it('settles the card and asks for a Gmail draft, without touching Gmail', async () => {
                const { mail_uid: uid } = await card();
                const fetchSpy = jest.spyOn(global, 'fetch');
                const response = await decide(uid, { decision: 'draft' });
                expect(response.status).toBe(200);
                expect(response.body).toMatchObject({
                    state: 'done',
                    decision: 'draft',
                    action: { type: 'draft', state: 'requested' },
                });
                expect(fetchSpy).not.toHaveBeenCalled();
                expect(await mailItems()).toEqual([]);
                expect(await Task.count({ where: { user_id: user.id } })).toBe(
                    0
                );
            });

            it('refuses a draft on a card that has no draft', async () => {
                const { mail_uid: uid } = await propose();
                const response = await decide(uid, { decision: 'draft' });
                expect(response.status).toBe(400);
                expect(await mailItems()).toHaveLength(1);
            });

            it('runs the same draft order once', async () => {
                const { mail_uid: uid } = await card();
                const body = { decision: 'draft', idempotency_key: 'd1' };
                expect((await decide(uid, body)).status).toBe(200);
                const again = await decide(uid, body);
                expect(again.status).toBe(200);
                expect(again.body.replayed).toBe(true);
            });
        });

        describe('archive decision', () => {
            it('settles the card and asks for the archive, with no gateway set', async () => {
                const { mail_uid: uid } = await card();
                const fetchSpy = jest.spyOn(global, 'fetch');
                const response = await decide(uid, { decision: 'archive' });
                expect(response.status).toBe(200);
                expect(response.body).toMatchObject({
                    state: 'done',
                    decision: 'archive',
                    action: { type: 'archive', state: 'requested' },
                });
                expect(fetchSpy).not.toHaveBeenCalled();
                expect(await mailItems()).toEqual([]);
            });

            it('refuses the archive flag on an archive decision', async () => {
                const { mail_uid: uid } = await card();
                const response = await decide(uid, {
                    decision: 'archive',
                    archive: true,
                });
                expect(response.status).toBe(400);
                expect(await mailItems()).toHaveLength(1);
            });
        });

        describe('note decision', () => {
            it('sends the card to review, hidden from the deck, and tells plugins', async () => {
                const pluginEvents = require('../../modules/plugins/eventBus');
                const heard = [];
                const stop = pluginEvents.subscribe((event) =>
                    heard.push(event)
                );
                let response;
                try {
                    const { mail_uid: uid } = await card();
                    response = await decide(uid, {
                        decision: 'note',
                        payload: { text: 'Plutôt vendredi matin' },
                    });
                } finally {
                    stop();
                }
                expect(response.status).toBe(200);
                expect(response.body).toMatchObject({
                    state: 'reviewing',
                    decision: 'note',
                });
                expect(await mailItems()).toEqual([]);
                const decided = heard.filter((e) => e.name === 'mail.decided');
                expect(decided).toHaveLength(1);
                expect(decided[0].data.mail).toMatchObject({
                    decision: 'note',
                    note: { text: 'Plutôt vendredi matin' },
                });
                const [entry] = await listed();
                expect(entry).toMatchObject({
                    status: 'reviewing',
                    note: { text: 'Plutôt vendredi matin' },
                });
            });

            it.each([
                ['missing', {}],
                ['empty', { text: '  ' }],
                ['over 500 characters', { text: 'x'.repeat(501) }],
            ])(
                'refuses a note that is %s, and keeps the card',
                async (_l, payload) => {
                    const { mail_uid: uid } = await card();
                    const response = await decide(uid, {
                        decision: 'note',
                        payload,
                    });
                    expect(response.status).toBe(400);
                    expect(await mailItems()).toHaveLength(1);
                }
            );

            it('answers 409 to a decision on a card waiting for the agent', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, {
                    decision: 'note',
                    payload: { text: 'Non' },
                });
                expect(
                    (await decide(uid, { decision: 'dismiss' })).status
                ).toBe(409);
            });

            it('replaces the card when the agent proposes the thread again', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, {
                    decision: 'note',
                    payload: { text: 'Plutôt vendredi' },
                });
                const second = await card({
                    options: ['task', 'dismiss'],
                    recommended: 'task',
                    draft: undefined,
                    excerpt: null,
                    summary: 'Nouvelle proposition après la note',
                });
                expect(second.mail_uid).toBe(uid);
                expect(second.status).toBe('pending');
                const items = await mailItems();
                expect(items).toHaveLength(1);
                expect(items[0].payload).toMatchObject({
                    options: ['task', 'dismiss'],
                    recommended: 'task',
                    draft: null,
                });
                expect(items[0].reason).toBe(
                    'Nouvelle proposition après la note'
                );
                const [entry] = await listed();
                expect(entry).toMatchObject({ note: null, status: 'pending' });
            });

            it('refuses a note on a card settled already', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'dismiss' });
                expect(
                    (
                        await decide(uid, {
                            decision: 'note',
                            payload: { text: 'Trop tard' },
                        })
                    ).status
                ).toBe(409);
            });
        });

        describe('report_mail_action', () => {
            it('marks a requested draft done with its Gmail link', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                await report({
                    type: 'draft',
                    ok: true,
                    draft_url: 'https://mail.google.com/mail/u/0/#drafts/abc',
                });
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.status).toBe('done');
                expect(row.action).toEqual({
                    type: 'draft',
                    state: 'done',
                    draft_url: 'https://mail.google.com/mail/u/0/#drafts/abc',
                });
                expect(row.action_error).toBeNull();
            });

            it('accepts a draft reported without a link', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                await report({ type: 'draft', ok: true });
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.action).toEqual({ type: 'draft', state: 'done' });
            });

            it('refuses a draft link outside Gmail', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                await expect(
                    report({
                        type: 'draft',
                        ok: true,
                        draft_url: 'https://evil.example.com/mail.google.com',
                    })
                ).rejects.toThrow(/draft_url/);
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.action.state).toBe('requested');
            });

            it('reopens the card with the error when a draft fails', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                await report({ type: 'draft', ok: false, error: 'gmail_down' });
                const row = await MailItem.findOne({ where: { uid } });
                expect(row).toMatchObject({
                    status: 'pending',
                    decision: null,
                    action_error: 'gmail_down',
                });
                expect(row.action).toEqual({ type: 'draft', state: 'failed' });
                const [item] = await mailItems();
                expect(item.payload.action_error).toBe('gmail_down');
                expect(item.payload.action).toEqual({
                    type: 'draft',
                    state: 'failed',
                });
            });

            it('runs the draft again after a failure, clearing the error', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                await report({ type: 'draft', ok: false, error: 'gmail_down' });
                expect((await decide(uid, { decision: 'draft' })).status).toBe(
                    200
                );
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.action).toEqual({
                    type: 'draft',
                    state: 'requested',
                });
                expect(row.action_error).toBeNull();
            });

            it('marks a requested archive done and dates it', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'archive' });
                await report({ type: 'archive', ok: true });
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.action).toEqual({ type: 'archive', state: 'done' });
                expect(row.archived_at).toBeInstanceOf(Date);
            });

            it('reopens the card when an archive fails', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'archive' });
                await report({
                    type: 'archive',
                    ok: false,
                    error: 'unknown_account',
                });
                const row = await MailItem.findOne({ where: { uid } });
                expect(row).toMatchObject({
                    status: 'pending',
                    action_error: 'unknown_account',
                });
                expect(row.archived_at).toBeNull();
            });

            it('answers the same report again as done, and refuses a contrary one', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'archive' });
                await report({ type: 'archive', ok: true });
                await expect(
                    report({ type: 'archive', ok: true })
                ).resolves.toBeDefined();
                await expect(
                    report({ type: 'archive', ok: false, error: 'x_y' })
                ).rejects.toThrow(/already/);
            });

            it('refuses a report for an action never requested on the card', async () => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'dismiss' });
                await expect(
                    report({ type: 'draft', ok: true })
                ).rejects.toThrow(/requested/);
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.action).toBeNull();
            });

            it.each([
                ['an unknown type', { type: 'send', ok: true }],
                ['a missing ok', { type: 'draft' }],
                ['a failure without a code', { type: 'draft', ok: false }],
                [
                    'a code that is not a code',
                    { type: 'draft', ok: false, error: 'Gmail is down!' },
                ],
                [
                    'an error on a success',
                    { type: 'draft', ok: true, error: 'gmail_down' },
                ],
                [
                    'a draft link on an archive',
                    {
                        type: 'archive',
                        ok: true,
                        draft_url: 'https://mail.google.com/x',
                    },
                ],
            ])('refuses %s', async (_label, fields) => {
                const { mail_uid: uid } = await card();
                await decide(uid, { decision: 'draft' });
                await expect(report(fields)).rejects.toThrow();
                const row = await MailItem.findOne({ where: { uid } });
                expect(row.action.state).toBe('requested');
            });
        });
    });

    describe('appointment (event decision)', () => {
        const meeting = {
            kind: 'event',
            event: {
                title: 'Visite du chantier',
                start: '2026-11-20T14:00:00+01:00',
                end: '2026-11-20T15:00:00+01:00',
                location: 'Rue du Lac 4',
            },
        };

        it('accepts an event suggestion and shows it on the card', async () => {
            await propose({ suggestion: meeting });
            const [item] = await mailItems();
            expect(item.payload.suggestion).toEqual({
                kind: 'event',
                event: { ...meeting.event, all_day: false },
            });
        });

        it('refuses an event suggestion without a valid start or ending before it', async () => {
            await expect(
                propose({
                    suggestion: { kind: 'event', event: { title: 'x' } },
                })
            ).rejects.toThrow(/start/);
            await expect(
                propose({
                    suggestion: {
                        kind: 'event',
                        event: {
                            title: 'x',
                            start: '2026-11-20T14:00:00Z',
                            end: '2026-11-20T13:00:00Z',
                        },
                    },
                })
            ).rejects.toThrow(/end/);
        });

        it('records the appointment for the agent, creates no task', async () => {
            const { mail_uid: uid } = await propose({ suggestion: meeting });
            const response = await decide(uid, { decision: 'event' });
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                state: 'done',
                decision: 'event',
                event: { ...meeting.event, all_day: false, state: 'requested' },
            });
            expect(await Task.count({ where: { user_id: user.id } })).toBe(0);
            const { cards } = JSON.parse(
                (await run('list_mail_cards', {})).content[0].text
            );
            expect(cards[0]).toMatchObject({
                decision: 'event',
                event: { title: 'Visite du chantier', state: 'requested' },
            });
        });

        it('takes a corrected date, and an all-day event from a day', async () => {
            const { mail_uid: uid } = await propose({ suggestion: meeting });
            const response = await decide(uid, {
                decision: 'event',
                payload: { start: '2026-11-21' },
            });
            expect(response.body.event).toMatchObject({
                title: 'Visite du chantier',
                start: '2026-11-21',
                end: null,
                all_day: true,
            });
        });

        it('refuses an appointment without any start, and keeps the card', async () => {
            const { mail_uid: uid } = await propose();
            const response = await decide(uid, { decision: 'event' });
            expect(response.status).toBe(400);
            expect(await mailItems()).toHaveLength(1);
        });

        it('tells plugins about every decision', async () => {
            const pluginEvents = require('../../modules/plugins/eventBus');
            const heard = [];
            const stop = pluginEvents.subscribe((event) => heard.push(event));
            try {
                const { mail_uid: uid } = await propose({
                    suggestion: meeting,
                });
                await decide(uid, { decision: 'event', idempotency_key: 'e1' });
                await decide(uid, { decision: 'event', idempotency_key: 'e1' });
            } finally {
                stop();
            }
            const decided = heard.filter((e) => e.name === 'mail.decided');
            expect(decided).toHaveLength(1);
            expect(decided[0].data.mail).toMatchObject({
                account: 'perso',
                thread_id: THREAD,
                decision: 'event',
                event: { title: 'Visite du chantier', state: 'requested' },
            });
        });

        it('lets the agent report the event it created, or why it could not', async () => {
            const { mail_uid: uid } = await propose({ suggestion: meeting });
            await decide(uid, { decision: 'event' });
            const report = (fields) =>
                run('report_mail_event', {
                    account: 'perso',
                    thread_id: THREAD,
                    ...fields,
                });
            await expect(
                report({ state: 'created', url: 'https://evil.example/x' })
            ).rejects.toThrow(/url/);
            await report({
                state: 'created',
                url: 'https://calendar.google.com/calendar/event?eid=abc',
            });
            let row = await MailItem.findOne({ where: { uid } });
            expect(row.event).toMatchObject({
                state: 'created',
                url: 'https://calendar.google.com/calendar/event?eid=abc',
            });
            await report({ state: 'failed', error: 'Agenda indisponible' });
            row = await MailItem.findOne({ where: { uid } });
            expect(row.event).toMatchObject({
                state: 'failed',
                error: 'Agenda indisponible',
            });
        });

        it('refuses a report on a card that asked for no event', async () => {
            const { mail_uid: uid } = await propose();
            await decide(uid, { decision: 'dismiss' });
            await expect(
                run('report_mail_event', {
                    account: 'perso',
                    thread_id: THREAD,
                    state: 'created',
                })
            ).rejects.toThrow(/event/);
        });
    });

    describe('Gmail gateway', () => {
        it('refuses to archive when no gateway is set, and changes nothing', async () => {
            const { mail_uid: uid } = await propose();
            const fetchSpy = jest.spyOn(global, 'fetch');
            const response = await decide(uid, {
                decision: 'dismiss',
                archive: true,
            });
            expect(response.status).toBe(400);
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(await mailItems()).toHaveLength(1);
            expect((await agent.get('/api/triage')).body.mail_archive).toBe(
                false
            );
        });

        it('archives the thread through archive_thread only', async () => {
            process.env.TUDUDI_GMAIL_MCP_URL =
                'http://gmail-restricted:8700/mcp';
            process.env.TUDUDI_GMAIL_MCP_TOKEN = 'secret-token';
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        content: [{ type: 'text', text: '{"archived":true}' }],
                    },
                }),
            });
            const { mail_uid: uid } = await propose();
            const response = await decide(uid, {
                decision: 'dismiss',
                archive: true,
            });
            expect(response.body).toMatchObject({
                state: 'done',
                archived: true,
            });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [url, init] = fetchSpy.mock.calls[0];
            expect(url).toBe('http://gmail-restricted:8700/mcp');
            expect(init.headers.Authorization).toBe('Bearer secret-token');
            expect(JSON.parse(init.body)).toMatchObject({
                method: 'tools/call',
                params: {
                    name: 'archive_thread',
                    arguments: { account: 'perso', thread_id: THREAD },
                },
            });
            expect((await agent.get('/api/triage')).body.mail_archive).toBe(
                true
            );
        });

        it('keeps the decision when the archive fails', async () => {
            process.env.TUDUDI_GMAIL_MCP_URL =
                'http://gmail-restricted:8700/mcp';
            process.env.TUDUDI_GMAIL_MCP_TOKEN = 'secret-token';
            jest.spyOn(global, 'fetch').mockRejectedValue(new Error('down'));
            const { mail_uid: uid } = await propose();
            const response = await decide(uid, {
                decision: 'dismiss',
                archive: true,
            });
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                state: 'done',
                archived: false,
            });
            expect(await mailItems()).toEqual([]);
        });

        it('treats a tool error from the gateway as not archived', async () => {
            process.env.TUDUDI_GMAIL_MCP_URL =
                'http://gmail-restricted:8700/mcp';
            process.env.TUDUDI_GMAIL_MCP_TOKEN = 'secret-token';
            jest.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 1,
                    result: {
                        isError: true,
                        content: [{ type: 'text', text: 'unknown_account' }],
                    },
                }),
            });
            const { mail_uid: uid } = await propose();
            const response = await decide(uid, {
                decision: 'dismiss',
                archive: true,
            });
            expect(response.body.archived).toBe(false);
        });
    });
});

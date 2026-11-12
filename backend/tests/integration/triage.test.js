'use strict';

const request = require('supertest');
const app = require('../../app');
const { Task, Project, Note, TaskTriage } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { ForbiddenError, ValidationError } = require('../../shared/errors');

const TOMORROW = () =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10);

describe('triage queue', () => {
    let user;
    let agent;

    const task = (fields) => Task.create({ user_id: user.id, ...fields });
    const queue = async () => (await agent.get('/api/triage')).body;

    beforeEach(async () => {
        user = await createTestUser({ email: 'triage@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    it('proposes nothing for a simple, clear task', async () => {
        await task({ name: 'Appeler le garage', status: 0 });
        expect((await queue()).items).toEqual([]);
    });

    it('never asks about two recurring tasks or two different days', async () => {
        await task({
            name: '💪 Sport',
            status: 0,
            recurrence_type: 'weekly',
            due_date: new Date(),
        });
        await task({
            name: '💪 Sport',
            status: 0,
            recurrence_type: 'weekly',
            due_date: new Date(Date.now() + 2 * 86400000),
        });
        await task({
            name: 'Ranger',
            status: 0,
            due_date: new Date(`${TOMORROW()}T12:00:00Z`),
        });
        await task({
            name: 'Ranger',
            status: 0,
            due_date: new Date(Date.now() + 5 * 86400000),
        });
        expect((await queue()).items).toEqual([]);
    });

    it('does not treat a done occurrence of a series as a duplicate', async () => {
        const master = await task({
            name: '💪 Sport',
            status: 0,
            recurrence_type: 'daily',
        });
        await task({
            name: '💪 Sport',
            status: 2,
            completed_at: new Date(),
            recurring_parent_id: master.id,
        });
        expect((await queue()).items).toEqual([]);
    });

    it('proposes cancelling a task done under the same name, with what tells them apart', async () => {
        const project = await Project.create({
            user_id: user.id,
            name: 'Maison fictive',
        });
        await task({
            name: 'Payer la facture',
            status: 2,
            completed_at: new Date(),
            project_id: project.id,
        });
        const open = await task({ name: 'payer la facture', status: 0 });

        const { items, tasks, count } = await queue();
        expect(count).toBe(1);
        expect(items[0]).toMatchObject({
            type: 'duplicate',
            task_uid: open.uid,
            action: 'cancel',
            question: null,
        });
        expect(items[0].reason).not.toContain('doublon');
        expect(items[0].details.join(' ')).toContain('Maison fictive');
        expect(tasks[open.uid].name).toBe('payer la facture');
    });

    it('proposes the date found in the note', async () => {
        const open = await task({
            name: 'Dossier',
            status: 0,
            note: `À rendre le ${TOMORROW()}`,
        });
        const { items } = await queue();
        expect(items[0]).toMatchObject({
            type: 'deadline_in_note',
            task_uid: open.uid,
            action: 'set_due',
            payload: { due_date: TOMORROW() },
        });
    });

    it('leaves a kept task alone until it changes', async () => {
        await task({
            name: 'Doublon fictif',
            status: 2,
            completed_at: new Date(),
        });
        const open = await task({ name: 'Doublon fictif', status: 0 });

        const res = await agent
            .post('/api/triage/keep')
            .send({ task_uid: open.uid });
        expect(res.status).toBe(200);
        expect((await queue()).items).toEqual([]);

        await open.update({ note: 'Changée' });
        expect((await queue()).items.map((i) => i.task_uid)).toEqual([
            open.uid,
        ]);
    });

    it('applies a corrected rename', async () => {
        const open = await task({ name: 'trucs', status: 0 });
        const res = await agent.post('/api/triage/apply').send({
            task_uid: open.uid,
            action: 'rename',
            payload: { name: 'Trier les papiers' },
        });
        expect(res.status).toBe(200);
        await open.reload();
        expect(open.name).toBe('Trier les papiers');
    });

    it('does not apply the same order twice', async () => {
        const open = await task({ name: 'Grand projet', status: 0 });
        const body = {
            task_uid: open.uid,
            action: 'split',
            payload: { subtasks: ['Une étape'] },
            idempotency_key: 'split-1',
        };
        await agent.post('/api/triage/apply').send(body);
        const again = await agent.post('/api/triage/apply').send(body);
        expect(again.body.replayed).toBe(true);
        expect(await Task.count({ where: { parent_task_id: open.id } })).toBe(
            1
        );
    });

    it('converts a task to a note and removes it', async () => {
        const open = await task({
            name: 'Idée fictive',
            note: 'Détail',
            status: 0,
        });
        await agent
            .post('/api/triage/apply')
            .send({ task_uid: open.uid, action: 'to_note' });
        expect(await Task.findByPk(open.id)).toBeNull();
        expect(
            await Note.count({
                where: { user_id: user.id, title: 'Idée fictive' },
            })
        ).toBe(1);
    });

    it('keeps the note and the tags of a converted task', async () => {
        const { Tag } = require('../../models');
        const open = await task({ name: 'Idée', note: 'Détail', status: 0 });
        const tag = await Tag.create({ name: 'lecture', user_id: user.id });
        await open.addTag(tag);
        await agent
            .post('/api/triage/apply')
            .send({ task_uid: open.uid, action: 'to_note' });
        const res = await agent.get('/api/notes');
        const notes = res.body.notes ?? res.body;
        const note = notes.find((n) => n.title === 'Idée');
        expect(note.content).toBe('Détail');
        expect((note.Tags ?? note.tags).map((t) => t.name)).toEqual([
            'lecture',
        ]);

        const habit = await task({
            name: 'Marcher',
            note: 'Dix mille pas',
            status: 0,
        });
        const done = await agent
            .post('/api/triage/apply')
            .send({ task_uid: habit.uid, action: 'to_habit' });
        expect(done.status).toBe(200);
        const { toolsFor } = require('../../modules/triage/actions');
        const listed = await toolsFor(user)('list_habits', {});
        expect(listed.content[0].text).toContain('Dix mille pas');
    });

    it('refuses to convert a task that has subtasks, and changes nothing', async () => {
        const parent = await task({ name: 'Parent', status: 0 });
        await task({
            name: 'Enfant',
            status: 0,
            parent_task_id: parent.id,
        });
        const res = await agent
            .post('/api/triage/apply')
            .send({ task_uid: parent.uid, action: 'to_note' });
        expect(res.status).toBe(400);
        expect(await Task.findByPk(parent.id)).not.toBeNull();
        expect(await Note.count({ where: { user_id: user.id } })).toBe(0);
    });

    it('refuses to convert or delete a shared task, and creates nothing', async () => {
        const { applyAction } = require('../../modules/triage/actions');
        const other = await createTestUser({ email: 'owner@example.com' });
        const shared = await Task.create({
            user_id: other.id,
            name: 'Partagée',
            status: 0,
        });
        const seen = { uid: shared.uid, name: 'Partagée', owned: false };
        await expect(applyAction(user, seen, 'to_note')).rejects.toBeInstanceOf(
            ForbiddenError
        );
        await expect(applyAction(user, seen, 'delete')).rejects.toBeInstanceOf(
            ForbiddenError
        );
        expect(await Note.count({ where: { user_id: user.id } })).toBe(0);
        expect(await Task.findByPk(shared.id)).not.toBeNull();
    });

    it('refuses to convert a task that follows a TODO.md file', async () => {
        const { applyAction } = require('../../modules/triage/actions');
        const open = await task({ name: 'Du fichier', status: 0 });
        await expect(
            applyAction(
                user,
                {
                    uid: open.uid,
                    name: 'Du fichier',
                    file_backed: true,
                },
                'to_note'
            )
        ).rejects.toBeInstanceOf(ValidationError);
        expect(await Note.count({ where: { user_id: user.id } })).toBe(0);
    });

    it('runs an order once when it is sent again during the first run', async () => {
        const open = await task({ name: 'À découper', status: 0 });
        const send = () =>
            agent.post('/api/triage/apply').send({
                task_uid: open.uid,
                action: 'split',
                payload: { subtasks: ['Un', 'Deux'] },
                idempotency_key: 'same-order',
            });
        const answers = await Promise.all([send(), send()]);
        expect(answers.map((res) => res.status)).toEqual([200, 200]);
        expect(await Task.count({ where: { parent_task_id: open.id } })).toBe(
            2
        );
    });

    it('lets an order run again after it failed', async () => {
        const open = await task({ name: 'Renommer', status: 0 });
        const send = (name) =>
            agent.post('/api/triage/apply').send({
                task_uid: open.uid,
                action: 'rename',
                payload: { name },
                idempotency_key: 'retry-order',
            });
        expect((await send('')).status).toBe(400);
        expect((await send('Nouveau')).status).toBe(200);
        expect((await Task.findByPk(open.id)).name).toBe('Nouveau');
    });

    it('refuses an unknown action and a task of someone else', async () => {
        const open = await task({ name: 'Tâche', status: 0 });
        const unknown = await agent
            .post('/api/triage/apply')
            .send({ task_uid: open.uid, action: 'explode' });
        expect(unknown.status).toBe(400);

        const other = await createTestUser({
            email: 'other-triage@example.com',
        });
        const foreign = await Task.create({
            user_id: other.id,
            name: 'Pas à moi',
            status: 0,
        });
        const denied = await agent
            .post('/api/triage/apply')
            .send({ task_uid: foreign.uid, action: 'delete' });
        expect(denied.status).toBe(404);
        expect(await Task.findByPk(foreign.id)).not.toBeNull();
    });

    it('stores what the assistant proposes, and does not ask it twice', async () => {
        const ai = require('../../modules/ai-assistant/service');
        const entitlements = require('../../services/entitlementsService');
        const assistant = require('../../modules/triage/assistant');
        const sources = require('../../modules/daily-plan/brief/sources');
        const open = await task({ name: 'trucs', status: 0 });
        const calm = await task({ name: 'Appeler Paul', status: 0 });
        await user.update({
            ui_settings: {
                brief: { triage: { enabled: true, dailyLimit: 5 } },
            },
        });
        jest.spyOn(sources, 'llmConfigured').mockResolvedValue(true);
        jest.spyOn(ai, 'getOpenAIClient').mockResolvedValue({});
        jest.spyOn(ai, 'getAIModel').mockResolvedValue('fictif');
        jest.spyOn(entitlements, 'consumeUsage').mockResolvedValue();
        jest.spyOn(entitlements, 'consumeMonthlyUsage').mockResolvedValue();
        const call = jest.spyOn(ai, 'callWithFallback').mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            tasks: [
                                {
                                    uid: open.uid,
                                    action: 'rename',
                                    name: 'Trier les papiers',
                                    reason: 'Le titre ne dit pas quoi faire.',
                                },
                                { uid: calm.uid, action: 'none' },
                            ],
                        }),
                    },
                },
            ],
        });

        expect(await assistant.reviewForUser(user)).toBe(2);
        expect((await queue()).items).toEqual([
            expect.objectContaining({
                source: 'assistant',
                task_uid: open.uid,
                action: 'rename',
                payload: { name: 'Trier les papiers' },
            }),
        ]);

        expect(await assistant.reviewForUser(user)).toBe(0);
        expect(call).toHaveBeenCalledTimes(1);
        jest.restoreAllMocks();
    });

    it('asks no model while the assistant is off', async () => {
        const assistant = require('../../modules/triage/assistant');
        await task({ name: 'trucs', status: 0 });
        expect(await assistant.reviewForUser(user)).toBe(0);
    });

    it('shows a stored assistant proposal only for the state it was made on', async () => {
        const open = await task({ name: 'trucs', status: 0 });
        const {
            taskFingerprint,
        } = require('../../modules/triage/core/fingerprint');
        await TaskTriage.create({
            user_id: user.id,
            task_uid: open.uid,
            fingerprint: taskFingerprint({
                name: 'trucs',
                note: null,
                due_date: null,
                status: 'not_started',
                project_name: null,
                tags: [],
                recurring: false,
            }),
            state: 'pending',
            proposal: {
                action: 'rename',
                payload: { name: 'Trier les papiers' },
                reason: 'Le titre ne dit pas quoi faire.',
            },
        });
        expect((await queue()).items[0]).toMatchObject({
            source: 'assistant',
            action: 'rename',
        });
        await open.update({ name: 'Autre chose' });
        expect((await queue()).items).toEqual([]);
    });
});

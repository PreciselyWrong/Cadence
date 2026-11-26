const request = require('supertest');
const app = require('../../app');
const { Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const model = require('../../modules/breakdown/model');

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

describe('task breakdown', () => {
    let user;
    let agent;
    let task;
    let calls;

    const answer = (steps) => {
        calls = [];
        model.configure({
            ask: async (input) => {
                calls.push(input);
                if (steps instanceof Error) throw steps;
                return steps;
            },
        });
    };

    beforeEach(async () => {
        ({ user, agent } = await signIn('breakdown@example.com'));
        await user.update({ features: { ai_assistant_enabled: true } });
        task = await Task.create({
            name: 'Faire la déclaration d’impôts',
            note: 'Tout est dans le classeur bleu',
            user_id: user.id,
        });
    });

    afterEach(() => model.configure({ ask: null }));

    it('proposes clean timed steps from the model and writes nothing', async () => {
        await Task.create({
            name: 'Trouver le certificat de salaire',
            user_id: user.id,
            parent_task_id: task.id,
        });
        answer([
            { name: 'Sortir le classeur bleu', minutes: 3 },
            { name: 'trouver le certificat de salaire', minutes: 10 },
            { name: 'Remplir le revenu', minutes: 20 },
        ]);

        const res = await agent.post(`/api/task/${task.uid}/breakdown`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            source: 'ai',
            reason: null,
            steps: [
                { name: 'Sortir le classeur bleu', minutes: 5 },
                { name: 'Remplir le revenu', minutes: 20 },
            ],
            total_minutes: 25,
        });
        expect(calls[0].task).toEqual({
            name: 'Faire la déclaration d’impôts',
            note: 'Tout est dans le classeur bleu',
            subtasks: ['Trouver le certificat de salaire'],
        });
        expect(await Task.count({ where: { parent_task_id: task.id } })).toBe(
            1
        );
    });

    it('falls back to a first small step when the model fails or answers nothing', async () => {
        answer(new Error('provider down'));
        const failed = await agent.post(`/api/task/${task.uid}/breakdown`);
        expect(failed.status).toBe(200);
        expect(failed.body).toEqual({
            source: 'fallback',
            reason: 'failed',
            steps: [],
            total_minutes: 0,
        });

        answer([{ name: '   ', minutes: 5 }]);
        const empty = await agent.post(`/api/task/${task.uid}/breakdown`);
        expect(empty.body).toMatchObject({
            source: 'fallback',
            reason: 'empty',
        });
    });

    it('falls back without calling anything when AI is off or not set up', async () => {
        const unset = await agent.post(`/api/task/${task.uid}/breakdown`);
        expect(unset.body).toMatchObject({
            source: 'fallback',
            reason: 'not_configured',
        });

        answer([{ name: 'Step', minutes: 5 }]);
        await user.update({ features: { ai_assistant_enabled: false } });
        const switchedOff = await agent.post(`/api/task/${task.uid}/breakdown`);
        expect(switchedOff.body).toMatchObject({
            source: 'fallback',
            reason: 'disabled',
        });
        await user.update({ features: { ai_assistant_enabled: true } });
        await agent.put('/api/breakdown/settings').send({ enabled: false });
        const off = await agent.post(`/api/task/${task.uid}/breakdown`);
        expect(off.body).toMatchObject({
            source: 'fallback',
            reason: 'disabled',
        });
        expect(calls).toHaveLength(0);
    });

    it('creates the kept steps as subtasks with their minutes, after the existing ones', async () => {
        await Task.create({
            name: 'Existante',
            user_id: user.id,
            parent_task_id: task.id,
            order: 1,
        });

        const res = await agent
            .post(`/api/task/${task.uid}/breakdown/apply`)
            .send({
                steps: [
                    { name: 'Sortir le classeur', minutes: 5 },
                    { name: 'Remplir', minutes: 20 },
                    { name: 'Sans durée' },
                ],
            });

        expect(res.status).toBe(201);
        expect(res.body.subtasks.map((s) => s.name)).toEqual([
            'Sortir le classeur',
            'Remplir',
            'Sans durée',
        ]);
        const subtasks = await Task.findAll({
            where: { parent_task_id: task.id },
            order: [['order', 'ASC']],
        });
        expect(
            subtasks.map((s) => [s.name, s.estimated_minutes, s.user_id])
        ).toEqual([
            ['Existante', null, user.id],
            ['Sortir le classeur', 5, user.id],
            ['Remplir', 20, user.id],
            ['Sans durée', null, user.id],
        ]);
    });

    it('refuses invalid steps, a subtask, a TODO.md task and another account', async () => {
        const bad = await agent
            .post(`/api/task/${task.uid}/breakdown/apply`)
            .send({ steps: [{ name: 'Trop long', minutes: 2000 }] });
        expect(bad.status).toBe(400);
        const none = await agent
            .post(`/api/task/${task.uid}/breakdown/apply`)
            .send({ steps: [] });
        expect(none.status).toBe(400);

        const child = await Task.create({
            name: 'Enfant',
            user_id: user.id,
            parent_task_id: task.id,
        });
        const nested = await agent.post(`/api/task/${child.uid}/breakdown`);
        expect(nested.status).toBe(400);

        const fromFile = await Task.create({
            name: 'Du fichier',
            user_id: user.id,
            source_key: 'abc',
        });
        const file = await agent
            .post(`/api/task/${fromFile.uid}/breakdown/apply`)
            .send({ steps: [{ name: 'A', minutes: 5 }] });
        expect(file.status).toBe(403);

        const other = await signIn('other-breakdown@example.com');
        const foreign = await other.agent.post(
            `/api/task/${task.uid}/breakdown`
        );
        expect([403, 404]).toContain(foreign.status);
        expect(await Task.count({ where: { parent_task_id: task.id } })).toBe(
            1
        );
    });

    it('reads and stores the settings', async () => {
        const read = await agent.get('/api/breakdown/settings');
        expect(read.status).toBe(200);
        expect(read.body.settings).toMatchObject({
            enabled: true,
            max_steps: read.body.defaults.max_steps,
        });

        const saved = await agent
            .put('/api/breakdown/settings')
            .send({ max_steps: 3, max_step_minutes: 15 });
        expect(saved.status).toBe(200);
        expect(saved.body.settings).toMatchObject({
            max_steps: 3,
            max_step_minutes: 15,
        });

        const refused = await agent
            .put('/api/breakdown/settings')
            .send({ max_steps: 0 });
        expect(refused.status).toBe(400);
    });
});

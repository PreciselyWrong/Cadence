'use strict';

// Automatic classification end to end, with the model's answer simulated:
// what is written, what is asked, what is left alone, and undo.
const request = require('supertest');
const app = require('../../app');
const {
    Task,
    Note,
    Link,
    Project,
    Area,
    Tag,
    Setting,
    AutoClassifyItem,
    AutoClassifyChange,
    AutoClassifySuggestion,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const worker = require('../../modules/auto-classify/worker');
const model = require('../../modules/auto-classify/model');

const SECOND = 1000;
const later = (seconds) => new Date(Date.now() + seconds * SECOND);

// One answer per item uid, from `byName` (task name, note title or link url).
function answering(byName) {
    const calls = [];
    const ask = async ({ entries }) => {
        calls.push(entries.map((e) => e.item.uid));
        return entries.map(({ item }) => {
            const key =
                item.entity === 'link' ? item.url : (item.name ?? item.title);
            const fields = byName[key];
            if (typeof fields === 'function') return fields(item);
            return {
                uid: item.uid,
                project: { uid: null, confidence: 0, alternatives: [] },
                area: { uid: null, confidence: 0 },
                new_project: { name: null, area_uid: null },
                tags: [],
                new_tag: null,
                estimated_minutes: { value: null, confidence: 0 },
                priority: { value: 0, confidence: 0 },
                summary: null,
                ...(fields || {}),
            };
        });
    };
    return { ask, calls };
}

const withDefaults = (uid, fields) => ({
    uid,
    project: { uid: null, confidence: 0, alternatives: [] },
    area: { uid: null, confidence: 0 },
    new_project: { name: null, area_uid: null },
    tags: [],
    new_tag: null,
    estimated_minutes: { value: null, confidence: 0 },
    priority: { value: 0, confidence: 0 },
    summary: null,
    ...fields,
});

describe('auto-classify', () => {
    let user;
    let agent;
    let garden;
    let car;
    let home;

    const tagsOf = async (Model, uid) =>
        (await Model.findOne({ where: { uid }, include: [Tag] })).Tags.map(
            (tag) => tag.name
        ).sort();

    beforeEach(async () => {
        await Setting.destroy({
            where: { key: [worker.CURSOR_KEY, worker.SINCE_KEY] },
        });
        model.configure({ ask: null, clearCache: true });
        user = await createTestUser({ email: 'classify@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
        home = await Area.create({ user_id: user.id, name: 'Maison' });
        garden = await Project.create({
            user_id: user.id,
            name: 'Jardin',
            area_id: home.id,
        });
        car = await Project.create({ user_id: user.id, name: 'Voiture' });
        await Tag.create({ user_id: user.id, name: 'extérieur' });
        await Tag.create({ user_id: user.id, name: 'achats' });
        await Tag.create({ user_id: user.id, name: 'urgent' });
        // The first pass only takes the journal position.
        await worker.runOnce(new Date());
    });

    afterEach(() => model.configure({ ask: null, clearCache: true }));

    it('fills the empty fields of a new task after the grace period, and logs it', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Tailler la haie',
            status: 0,
        });
        const { ask, calls } = answering({
            'Tailler la haie': {
                project: {
                    uid: garden.uid,
                    confidence: 0.92,
                    alternatives: [],
                },
                tags: [
                    { name: 'extérieur', confidence: 0.9 },
                    { name: 'urgent', confidence: 1 },
                ],
                estimated_minutes: { value: 60, confidence: 0.7 },
            },
        });
        model.configure({ ask });

        await worker.runOnce(later(30));
        expect(calls).toHaveLength(0);

        await worker.runOnce(later(91));
        expect(calls).toEqual([[task.uid]]);
        await task.reload();
        expect(task.project_id).toBe(garden.id);
        expect(task.estimated_minutes).toBe(60);
        expect(await tagsOf(Task, task.uid)).toEqual(['extérieur']);

        const change = await AutoClassifyChange.findOne({
            where: { item_uid: task.uid },
        });
        expect(change.before).toEqual({
            project_uid: null,
            tags: [],
            estimated_minutes: null,
        });
        expect(change.after).toEqual({
            project_uid: garden.uid,
            tags: ['extérieur'],
            estimated_minutes: 60,
        });
        expect(change.confidences.project).toBe(0.92);

        const marks = (
            await agent.get(
                `/api/auto-classify/marks?entity=task&uid=${task.uid}`
            )
        ).body.marks;
        expect(marks).toHaveLength(1);

        // Seen once: a later pass leaves it alone.
        await worker.runOnce(later(200));
        expect(calls).toHaveLength(1);
    });

    it('never touches a field the user filled during the grace period', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Changer les pneus',
            status: 0,
        });
        await task.update({ project_id: car.id });
        const { ask } = answering({
            'Changer les pneus': {
                project: { uid: garden.uid, confidence: 1, alternatives: [] },
                estimated_minutes: { value: 45, confidence: 0.9 },
            },
        });
        model.configure({ ask });
        await worker.runOnce(later(91));
        await task.reload();
        expect(task.project_id).toBe(car.id);
        expect(task.estimated_minutes).toBe(45);
    });

    it('writes nothing when the item changes while the model answers', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Ranger le garage',
            status: 0,
        });
        model.configure({
            ask: async ({ entries }) => {
                await Task.update(
                    { name: 'Ranger le garage samedi' },
                    { where: { uid: task.uid } }
                );
                return [
                    withDefaults(entries[0].item.uid, {
                        project: {
                            uid: garden.uid,
                            confidence: 1,
                            alternatives: [],
                        },
                    }),
                ];
            },
        });
        await worker.runOnce(later(91));
        await task.reload();
        expect(task.project_id).toBeNull();
        expect(await AutoClassifyChange.count()).toBe(0);
        expect(
            (await AutoClassifyItem.findOne({ where: { item_uid: task.uid } }))
                .state
        ).toBe('changed');
    });

    it('leaves recurring tasks, habits and subtasks alone', async () => {
        const parent = await Task.create({
            user_id: user.id,
            name: 'Parent',
            status: 0,
        });
        await Task.create({
            user_id: user.id,
            name: 'Sport',
            status: 0,
            recurrence_type: 'weekly',
        });
        await Task.create({
            user_id: user.id,
            name: 'Sous',
            status: 0,
            parent_task_id: parent.id,
        });
        const { ask, calls } = answering({});
        model.configure({ ask });
        await worker.runOnce(later(91));
        expect(calls.flat()).toEqual([parent.uid]);
    });

    it('ignores items that existed before the classifier', async () => {
        const old = await Task.create({
            user_id: user.id,
            name: 'Ancienne',
            status: 0,
        });
        await Setting.destroy({
            where: { key: [worker.CURSOR_KEY, worker.SINCE_KEY] },
        });
        await worker.runOnce(later(1));
        await old.update({ note: 'modifiée' });
        const { ask, calls } = answering({});
        model.configure({ ask });
        await worker.runOnce(later(200));
        expect(calls).toHaveLength(0);
    });

    it('records but writes nothing in a dry run', async () => {
        await agent
            .put('/api/auto-classify/settings')
            .send({ mode: 'dry_run' });
        const task = await Task.create({
            user_id: user.id,
            name: 'Tailler la haie',
            status: 0,
        });
        const { ask } = answering({
            'Tailler la haie': {
                project: {
                    uid: garden.uid,
                    confidence: 0.95,
                    alternatives: [],
                },
            },
        });
        model.configure({ ask });
        await worker.runOnce(later(91));
        await task.reload();
        expect(task.project_id).toBeNull();
        const change = await AutoClassifyChange.findOne({
            where: { item_uid: task.uid },
        });
        expect(change.dry_run).toBe(true);
        expect(change.after).toEqual({ project_uid: garden.uid });
    });

    it('retries a failed call, then gives up after max_attempts', async () => {
        await agent
            .put('/api/auto-classify/settings')
            .send({ max_attempts: 2 });
        const task = await Task.create({
            user_id: user.id,
            name: 'Réseau',
            status: 0,
        });
        model.configure({
            ask: async () => {
                throw Object.assign(new Error('timeout'), {
                    code: 'ETIMEDOUT',
                });
            },
        });
        await worker.runOnce(later(91));
        let row = await AutoClassifyItem.findOne({
            where: { item_uid: task.uid },
        });
        expect(row.state).toBe('queued');
        expect(row.attempts).toBe(1);
        expect(row.last_error).toBe('ETIMEDOUT');
        expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(
            later(91).getTime()
        );

        await worker.runOnce(later(91 + 61));
        row = await row.reload();
        expect(row.state).toBe('failed');
        expect(row.attempts).toBe(2);
    });

    it('asks when unsure, through the triage queue, and applies the tap', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Acheter du terreau',
            status: 0,
        });
        const { ask } = answering({
            'Acheter du terreau': {
                project: {
                    uid: garden.uid,
                    confidence: 0.6,
                    alternatives: [car.uid],
                },
                tags: [{ name: 'achats', confidence: 0.5 }],
                new_tag: 'jardinage',
                priority: { value: 2, confidence: 0.9 },
            },
        });
        model.configure({ ask });
        await worker.runOnce(later(91));
        await task.reload();
        expect(task.project_id).toBeNull();

        const queue = (await agent.get('/api/triage')).body;
        const card = queue.items.find((item) => item.type === 'classify');
        expect(card.task_uid).toBe(task.uid);
        expect(card.payload.project.options.map((o) => o.name)).toEqual([
            'Jardin',
            'Voiture',
        ]);
        expect(card.payload.project.area).toEqual({
            uid: home.uid,
            name: 'Maison',
        });
        expect(card.payload.tags).toEqual({
            options: ['achats'],
            new_tag: 'jardinage',
        });
        expect(card.payload.priority).toEqual({ value: 2, confidence: 0.9 });
        expect(queue.tasks[task.uid].name).toBe('Acheter du terreau');

        const applied = await agent
            .post(
                `/api/auto-classify/suggestions/${card.payload.suggestion_uid}/apply`
            )
            .send({ choice: 'all' });
        expect(applied.status).toBe(200);
        await task.reload();
        expect(task.project_id).toBe(garden.id);
        expect(task.priority).toBe(2);
        expect(await tagsOf(Task, task.uid)).toEqual(['achats']);

        const again = await agent
            .post(
                `/api/auto-classify/suggestions/${card.payload.suggestion_uid}/apply`
            )
            .send({ choice: 'all' });
        expect(again.status).toBe(409);
        expect(
            (await agent.get('/api/triage')).body.items.some(
                (i) => i.type === 'classify'
            )
        ).toBe(false);
    });

    it('creates the new project and tag the user confirms', async () => {
        const note = await Note.create({
            user_id: user.id,
            title: 'Idées pour la cabane',
            content: 'Plans',
        });
        const { ask } = answering({
            'Idées pour la cabane': {
                new_project: { name: 'Cabane', area_uid: home.uid },
            },
        });
        model.configure({ ask });
        await worker.runOnce(later(91));
        const suggestion = await AutoClassifySuggestion.findOne({
            where: { item_uid: note.uid },
        });
        expect(suggestion.payload.project.new_project).toEqual({
            name: 'Cabane',
            area_uid: home.uid,
            area_name: 'Maison',
        });
        const res = await agent
            .post(`/api/auto-classify/suggestions/${suggestion.uid}/apply`)
            .send({
                choice: {
                    project: {
                        type: 'new_project',
                        name: 'Cabane au fond',
                        area_uid: home.uid,
                    },
                    tags: [],
                    new_tag: 'bois',
                },
            });
        expect(res.status).toBe(200);
        const created = await Project.findOne({
            where: { name: 'Cabane au fond' },
        });
        expect(created.area_id).toBe(home.id);
        await note.reload();
        expect(note.project_id).toBe(created.id);
        expect(await tagsOf(Note, note.uid)).toEqual(['bois']);
    });

    it('dismisses a card without changing anything', async () => {
        const task = await Task.create({
            user_id: user.id,
            name: 'Peut-être',
            status: 0,
        });
        model.configure({
            ask: answering({
                'Peut-être': {
                    project: {
                        uid: car.uid,
                        confidence: 0.5,
                        alternatives: [],
                    },
                },
            }).ask,
        });
        await worker.runOnce(later(91));
        const suggestion = await AutoClassifySuggestion.findOne({
            where: { item_uid: task.uid },
        });
        const res = await agent.post(
            `/api/auto-classify/suggestions/${suggestion.uid}/dismiss`
        );
        expect(res.status).toBe(200);
        await task.reload();
        expect(task.project_id).toBeNull();
        expect((await suggestion.reload()).state).toBe('dismissed');
    });

    it('reports a duplicate link without asking the model, and merges on request', async () => {
        const original = await Link.create({
            user_id: user.id,
            url: 'https://github.com/owner/tool',
            note: 'à tester',
            fetch_status: 'done',
        });
        await worker.runOnce(later(1));
        const { ask, calls } = answering({});
        model.configure({ ask });
        const fresh = await Link.create({
            user_id: user.id,
            url: 'https://github.com/owner/tool/issues',
            note: 'vu sur un blog',
            fetch_status: 'done',
        });
        await fresh.setTags(await Tag.findAll({ where: { name: 'achats' } }));
        await worker.runOnce(later(200));
        expect(calls.flat()).not.toContain(fresh.uid);
        const suggestion = await AutoClassifySuggestion.findOne({
            where: { item_uid: fresh.uid },
        });
        expect(suggestion.kind).toBe('duplicate');
        expect(suggestion.payload.original.uid).toBe(original.uid);
        expect(suggestion.payload.reason).toBe('repository');

        const queue = (await agent.get('/api/triage')).body;
        expect(
            queue.items.find((i) => i.type === 'link_duplicate').payload
                .original.uid
        ).toBe(original.uid);

        const res = await agent
            .post(`/api/auto-classify/suggestions/${suggestion.uid}/apply`)
            .send({ choice: { action: 'merge' } });
        expect(res.status).toBe(200);
        await original.reload();
        await fresh.reload();
        expect(fresh.status).toBe('dropped');
        expect(original.note).toBe('à tester\n\nvu sur un blog');
        expect(await tagsOf(Link, original.uid)).toEqual(['achats']);
    });

    it('waits for the page of a link, then tags and summarizes it', async () => {
        const link = await Link.create({
            user_id: user.id,
            url: 'https://example.org/article',
            fetch_status: 'pending',
        });
        const { ask, calls } = answering({
            'https://example.org/article': {
                tags: [{ name: 'achats', confidence: 0.9 }],
                summary: 'Un guide pour bien acheter. Il compare les offres.',
            },
        });
        model.configure({ ask });
        await worker.runOnce(later(91));
        expect(calls).toHaveLength(0);
        expect(
            (await AutoClassifyItem.findOne({ where: { item_uid: link.uid } }))
                .state
        ).toBe('waiting');

        await link.update({
            fetch_status: 'done',
            title: 'Bien acheter',
            description:
                'Un guide complet pour comparer les offres et acheter malin.',
        });
        await worker.runOnce(later(120));
        await link.reload();
        expect(link.note).toBe(
            'Résumé auto : Un guide pour bien acheter. Il compare les offres.'
        );
        expect(await tagsOf(Link, link.uid)).toEqual(['achats']);
    });

    it('undoes a change, and refuses once the item was edited', async () => {
        const first = await Task.create({
            user_id: user.id,
            name: 'Un',
            status: 0,
        });
        const second = await Task.create({
            user_id: user.id,
            name: 'Deux',
            status: 0,
        });
        const sure = {
            project: { uid: garden.uid, confidence: 0.95, alternatives: [] },
        };
        model.configure({ ask: answering({ Un: sure, Deux: sure }).ask });
        await worker.runOnce(later(91));
        const changes = await AutoClassifyChange.findAll({
            order: [['id', 'ASC']],
        });
        expect(changes).toHaveLength(2);
        expect(changes[0].run_id).toBe(changes[1].run_id);

        await second.reload();
        await second.update({ name: 'Deux modifié' });
        const refused = await agent.post(
            `/api/auto-classify/changes/${changes[1].id}/undo`
        );
        expect(refused.status).toBe(409);

        const runs = (await agent.get('/api/auto-classify/runs')).body.runs;
        expect(runs[0].undoable).toBe(1);

        const undone = await agent.post(
            `/api/auto-classify/runs/${changes[0].run_id}/undo`
        );
        expect(undone.body.undone).toBe(1);
        expect(undone.body.refused).toHaveLength(1);
        await first.reload();
        await second.reload();
        expect(first.project_id).toBeNull();
        expect(second.project_id).toBe(garden.id);
        expect(
            (
                await agent.get(
                    `/api/auto-classify/marks?entity=task&uid=${first.uid}`
                )
            ).body.marks
        ).toEqual([]);
    });

    it('validates and stores the settings', async () => {
        const bad = await agent
            .put('/api/auto-classify/settings')
            .send({ batch_size: 0 });
        expect(bad.status).toBe(400);
        const ok = await agent
            .put('/api/auto-classify/settings')
            .send({ thresholds: { project: 0.9 }, excluded_tags: ['perso'] });
        expect(ok.status).toBe(200);
        expect(ok.body.settings.thresholds).toMatchObject({
            project: 0.9,
            tags: 0.8,
        });
        expect(ok.body.settings.excluded_tags).toEqual(['perso']);
        expect(ok.body.defaults.batch_size).toBe(12);
    });

    it('stops classifying when disabled', async () => {
        await agent.put('/api/auto-classify/settings').send({ enabled: false });
        await Task.create({ user_id: user.id, name: 'Rien', status: 0 });
        const { ask, calls } = answering({});
        model.configure({ ask });
        await worker.runOnce(later(91));
        expect(calls).toHaveLength(0);
        expect(await AutoClassifyItem.count()).toBe(0);
    });
});

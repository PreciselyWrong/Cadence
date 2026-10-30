const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../../app');
const { Task, Project, Tag } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const service = require('../../modules/todo-md/service');
const watcher = require('../../modules/todo-md/watcher');

const hlc = (ms) => `${String(ms).padStart(13, '0')}-0000-devA`;

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

const ALPHA = [
    '# Alpha',
    '',
    '## Now',
    '- Ship the thing',
    '  with a note',
    '  - sub bullet',
    '',
    '## Next',
    '- [ ] Write docs',
    '- Fix bug',
    '',
    '## Ideas',
    '- Maybe a widget',
    '',
    '## Done',
    '- Set up repo',
    '',
].join('\n');
const BETA = '## Next\n- [x] Already done\n- Open one\n';

describe('TODO.md projects', () => {
    let root;
    let user;
    let agent;
    const alpha = () => path.join(root, 'alpha', 'TODO.md');
    const tasksOf = async (name) => {
        const project = await Project.findOne({ where: { name } });
        return Task.findAll({
            where: { project_id: project.id },
            order: [['id', 'ASC']],
        });
    };

    beforeEach(async () => {
        root = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'todo-root-'))
        );
        fs.mkdirSync(path.join(root, 'alpha'));
        fs.mkdirSync(path.join(root, 'beta'));
        fs.mkdirSync(path.join(root, 'empty'));
        fs.writeFileSync(alpha(), ALPHA);
        fs.writeFileSync(path.join(root, 'beta', 'TODO.md'), BETA);
        process.env.TUDUDI_TODO_ROOT = root;
        ({ user, agent } = await signIn('todo@example.com'));
    });

    afterEach(() => {
        delete process.env.TUDUDI_TODO_ROOT;
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('turns each folder with a TODO.md into a project with its tasks', async () => {
        const res = await agent.post('/api/todo-md/rescan');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            projects: 2,
            created: 7,
            removed: 0,
        });
        const projects = await Project.findAll({
            where: { source_type: 'todo_md' },
            order: [['name', 'ASC']],
        });
        expect(projects.map((p) => [p.name, p.source_path])).toEqual([
            ['alpha', 'alpha/TODO.md'],
            ['beta', 'beta/TODO.md'],
        ]);

        const tasks = await tasksOf('alpha');
        expect(
            tasks.map((t) => [t.name, t.source_section, t.status, t.note])
        ).toEqual([
            ['Ship the thing', 'Now', 0, 'with a note\n- sub bullet'],
            ['Write docs', 'Next', 0, null],
            ['Fix bug', 'Next', 0, null],
            ['Maybe a widget', 'Ideas', 0, null],
            ['Set up repo', 'Done', 2, null],
        ]);
        expect(tasks.every((t) => t.user_id === user.id)).toBe(true);
        const beta = await tasksOf('beta');
        expect(beta.map((t) => [t.name, t.status])).toEqual([
            ['Already done', 2],
            ['Open one', 0],
        ]);
        expect(await Tag.count({ where: { name: 'Next' } })).toBe(1);
        const [first] = await Task.findAll({
            where: { name: 'Ship the thing' },
            include: [Tag],
        });
        expect(first.Tags.map((t) => t.name)).toEqual(['Now']);
    });

    it('does not duplicate anything when it reads the same files again', async () => {
        await agent.post('/api/todo-md/rescan');
        const before = await Task.count();
        const res = await agent.post('/api/todo-md/rescan');

        expect(res.body).toMatchObject({ created: 0, updated: 0, removed: 0 });
        expect(await Task.count()).toBe(before);
    });

    it('writes a task added through the API into the file', async () => {
        await agent.post('/api/todo-md/rescan');
        const project = await Project.findOne({ where: { name: 'alpha' } });
        const before = fs.readFileSync(alpha(), 'utf8');

        const res = await agent
            .post('/api/task')
            .send({ name: 'Brand new', project_uid: project.uid });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Brand new');
        const after = fs.readFileSync(alpha(), 'utf8');
        expect(after).toBe(
            before.replace('- Fix bug\n', '- Fix bug\n- Brand new\n')
        );
        const again = await agent.post('/api/todo-md/rescan');
        expect(again.body).toMatchObject({ created: 0, removed: 0 });
        expect(await Task.count({ where: { name: 'Brand new' } })).toBe(1);

        const ideas = await agent.post('/api/task').send({
            name: 'Into ideas',
            note: 'why',
            project_uid: project.uid,
            todo_section: 'Ideas',
        });
        expect(ideas.status).toBe(201);
        expect(fs.readFileSync(alpha(), 'utf8')).toContain(
            '- Maybe a widget\n- Into ideas\n  why\n'
        );
    });

    it('creates the Next section when the file has none', async () => {
        fs.writeFileSync(alpha(), '# Alpha\n\n## Now\n- Only now\n');
        await agent.post('/api/todo-md/rescan');
        const project = await Project.findOne({ where: { name: 'alpha' } });

        await agent
            .post('/api/task')
            .send({ name: 'First next', project_uid: project.uid });

        expect(fs.readFileSync(alpha(), 'utf8')).toBe(
            '# Alpha\n\n## Now\n- Only now\n\n## Next\n\n- First next\n'
        );
    });

    it('follows edits made to the file elsewhere, updating rows in place', async () => {
        await agent.post('/api/todo-md/rescan');
        const [ship, docs, fix, widget] = await tasksOf('alpha');

        fs.writeFileSync(
            alpha(),
            [
                '# Alpha',
                '## Now',
                '- Write docs',
                '- Added outside',
                '## Next',
                '- Fix bug',
                '  now with a note',
                '- [x] Maybe a widget',
                '',
                '## Done',
                '- Set up repo',
                '',
            ].join('\n')
        );
        const res = await agent.post('/api/todo-md/rescan');

        expect(res.body).toMatchObject({ created: 1, removed: 1 });
        const tasks = await tasksOf('alpha');
        expect(tasks.map((t) => t.name)).toEqual([
            'Write docs',
            'Fix bug',
            'Maybe a widget',
            'Set up repo',
            'Added outside',
        ]);
        expect(await Task.findOne({ where: { uid: ship.uid } })).toBeNull();
        const moved = await Task.findOne({ where: { uid: docs.uid } });
        expect(moved.source_section).toBe('Now');
        const noted = await Task.findOne({ where: { uid: fix.uid } });
        expect(noted.note).toBe('now with a note');
        const checked = await Task.findOne({ where: { uid: widget.uid } });
        expect(checked.status).toBe(2);
        expect(checked.completed_at).not.toBeNull();
        const [movedTag] = await moved.getTags();
        expect(movedTag.name).toBe('Now');
    });

    it('keeps everything when the root cannot be read', async () => {
        await agent.post('/api/todo-md/rescan');
        const before = await Task.count();
        process.env.TUDUDI_TODO_ROOT = path.join(root, 'gone');

        const res = await agent.post('/api/todo-md/rescan');

        expect(res.status).toBe(503);
        expect(await Task.count()).toBe(before);
    });

    it('refuses edits and deletes but writes a check mark back to the file', async () => {
        await agent.post('/api/todo-md/rescan');
        const [, docs, fix] = await tasksOf('alpha');

        const edit = await agent
            .patch(`/api/task/${docs.uid}`)
            .send({ name: 'Renamed', priority: 2 });
        expect(edit.status).toBe(403);
        expect(edit.body.code).toBe('todo_md_read_only');
        const del = await agent.delete(`/api/task/${docs.uid}`);
        expect(del.status).toBe(403);
        expect(await Task.findOne({ where: { uid: docs.uid } })).not.toBeNull();

        const done = await agent
            .patch(`/api/task/${docs.uid}`)
            .send({ status: 2 });
        expect(done.status).toBe(200);
        expect(done.body.status).toBe(2);
        expect(fs.readFileSync(alpha(), 'utf8')).toContain(
            '- [x] Write docs\n'
        );

        const plain = await agent
            .patch(`/api/task/${fix.uid}`)
            .send({ status: 'done' });
        expect(plain.status).toBe(200);
        expect(fs.readFileSync(alpha(), 'utf8')).toContain('- [x] Fix bug\n');

        const undone = await agent
            .patch(`/api/task/${fix.uid}`)
            .send({ status: 0 });
        expect(undone.status).toBe(200);
        expect(fs.readFileSync(alpha(), 'utf8')).toContain('- [ ] Fix bug\n');

        const [repo] = (await tasksOf('alpha')).slice(-1);
        const reopen = await agent
            .patch(`/api/task/${repo.uid}`)
            .send({ status: 0 });
        expect(reopen.status).toBe(409);
        expect(fs.readFileSync(alpha(), 'utf8')).toContain(
            '## Done\n- Set up repo'
        );
    });

    it('keeps the project name and refuses to delete it, but allows other settings', async () => {
        await agent.post('/api/todo-md/rescan');
        const project = await Project.findOne({ where: { name: 'alpha' } });

        const rename = await agent
            .patch(`/api/project/${project.uid}`)
            .send({ name: 'Other' });
        expect(rename.status).toBe(403);
        const del = await agent.delete(`/api/project/${project.uid}`);
        expect(del.status).toBe(403);
        const pin = await agent
            .patch(`/api/project/${project.uid}`)
            .send({ name: 'alpha', pin_to_sidebar: true });
        expect(pin.status).toBe(200);
    });

    describe('offline sync', () => {
        const push = (ops) => agent.post('/api/v1/sync/push').send({ ops });
        const upsert = (opId, entity, uid, fields) => ({
            op_id: opId,
            entity,
            uid,
            action: 'upsert',
            fields: Object.fromEntries(
                Object.entries(fields).map(([k, v]) => [
                    k,
                    { value: v, hlc: hlc(5000) },
                ])
            ),
        });

        it('sends source_type to devices and refuses to take it from them', async () => {
            await agent.post('/api/todo-md/rescan');
            const project = await Project.findOne({ where: { name: 'alpha' } });

            const snap = await agent.get(
                '/api/v1/sync/snapshot?entity=project'
            );
            const row = snap.body.rows.find((r) => r.uid === project.uid);
            expect(row.source_type).toBe('todo_md');

            const res = await push([
                upsert('st-1', 'project', 'plainproject01', {
                    name: 'Plain',
                    source_type: 'todo_md',
                }),
            ]);
            expect(res.body.results[0]).toMatchObject({
                status: 'rejected',
                reason: 'unknown_field:source_type',
            });
        });

        it('writes a task created on a device into the file, keeping its uid', async () => {
            await agent.post('/api/todo-md/rescan');
            const project = await Project.findOne({ where: { name: 'alpha' } });

            const res = await push([
                upsert('create-1', 'task', 'devicetask0001', {
                    name: 'From the phone',
                    project_uid: project.uid,
                    priority: 2,
                }),
            ]);

            expect(res.body.results[0].status).toBe('applied');
            expect(fs.readFileSync(alpha(), 'utf8')).toContain(
                '- Fix bug\n- From the phone\n'
            );
            const task = await Task.findOne({
                where: { uid: 'devicetask0001' },
            });
            expect(task.name).toBe('From the phone');
            expect(task.source_section).toBe('Next');
            await agent.post('/api/todo-md/rescan');
            expect(
                await Task.count({ where: { name: 'From the phone' } })
            ).toBe(1);

            const pull = await agent.get('/api/v1/sync/pull?cursor=0');
            const mine = pull.body.changes.filter(
                (c) => c.uid === 'devicetask0001'
            );
            expect(mine.length).toBeGreaterThan(0);
            expect(mine.every((c) => c.op_id === null)).toBe(true);
        });

        it('refuses device edits and deletes of mirrored rows but takes a check mark', async () => {
            await agent.post('/api/todo-md/rescan');
            const [, docs] = await tasksOf('alpha');
            const project = await Project.findOne({ where: { name: 'alpha' } });

            const edit = await push([
                upsert('edit-1', 'task', docs.uid, { name: 'Hacked' }),
                {
                    op_id: 'del-1',
                    entity: 'task',
                    uid: docs.uid,
                    action: 'delete',
                    hlc: hlc(6000),
                },
                {
                    op_id: 'del-2',
                    entity: 'project',
                    uid: project.uid,
                    action: 'delete',
                    hlc: hlc(6000),
                },
            ]);
            expect(edit.body.results.map((r) => r.reason)).toEqual([
                'read_only',
                'read_only',
                'read_only',
            ]);

            const check = await push([
                upsert('check-1', 'task', docs.uid, {
                    status: 2,
                    completed_at: '2026-10-30T10:00:00.000Z',
                }),
            ]);
            expect(check.body.results[0].status).toBe('applied');
            expect(fs.readFileSync(alpha(), 'utf8')).toContain(
                '- [x] Write docs\n'
            );
        });
    });

    it('re-imports a changed file on the next poll, and only then', async () => {
        await watcher.scan({ force: true });
        expect(await Task.count()).toBe(7);
        expect(await watcher.scan()).toBeNull();

        const later = new Date(Date.now() + 5000);
        fs.appendFileSync(alpha(), '\n## Next\n- Picked up by the poll\n');
        fs.utimesSync(alpha(), later, later);
        const summary = await watcher.scan();

        expect(summary).toMatchObject({ created: 1 });
        expect(
            await Task.count({ where: { name: 'Picked up by the poll' } })
        ).toBe(1);
        watcher.stop();
    });

    it('keeps one task per bullet when several are added at once', async () => {
        await agent.post('/api/todo-md/rescan');
        const project = await Project.findOne({ where: { name: 'alpha' } });

        const results = await Promise.all([
            ...['a', 'b', 'c'].map((name) =>
                agent.post('/api/task').send({
                    name: `Parallel ${name}`,
                    project_uid: project.uid,
                })
            ),
            agent.post('/api/todo-md/rescan'),
        ]);

        expect(results.map((r) => r.status)).toEqual([201, 201, 201, 200]);
        const text = fs.readFileSync(alpha(), 'utf8');
        for (const name of ['a', 'b', 'c']) {
            expect(text.split(`- Parallel ${name}\n`)).toHaveLength(2);
            expect(
                await Task.count({ where: { name: `Parallel ${name}` } })
            ).toBe(1);
        }
    });

    it('is off without a root', async () => {
        delete process.env.TUDUDI_TODO_ROOT;
        expect(service.isEnabled()).toBe(false);
        const res = await agent.post('/api/todo-md/rescan');
        expect(res.status).toBe(404);
        const status = await agent.get('/api/todo-md/status');
        expect(status.body.enabled).toBe(false);
    });

    it('only lets the owning account reread', async () => {
        const other = await signIn('other@example.com');
        const res = await other.agent.post('/api/todo-md/rescan');
        expect(res.status).toBe(403);
    });
});

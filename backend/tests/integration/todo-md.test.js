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
        for (const name of ['alpha', 'beta']) {
            await Project.create({
                name,
                user_id: user.id,
                source_type: 'todo_md',
                source_path: `${name}/TODO.md`,
            });
        }
    });

    afterEach(() => {
        delete process.env.TUDUDI_TODO_ROOT;
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('fills each linked project with the tasks of its TODO.md', async () => {
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
        expect(await Tag.count({ where: { name: 'Next' } })).toBe(0);
        expect(await Tag.count({ where: { name: 'code' } })).toBe(1);
        const [first] = await Task.findAll({
            where: { name: 'Ship the thing' },
            include: [Tag],
        });
        expect(first.Tags.map((t) => t.name)).toEqual(['code']);
    });

    it('gives no completion date to a bullet first read closed, but dates a later check', async () => {
        fs.appendFileSync(alpha(), '\n## Dropped\n- Old idea\n');
        await agent.post('/api/todo-md/rescan');
        const closed = await Task.findOne({ where: { name: 'Set up repo' } });
        const dropped = await Task.findOne({ where: { name: 'Old idea' } });
        expect(closed.status).toBe(2);
        expect(closed.completed_at).toBeNull();
        expect(dropped.status).toBe(3);
        expect(dropped.completed_at).toBeNull();

        await agent.post('/api/todo-md/rescan');
        await dropped.reload();
        expect(dropped.completed_at).toBeNull();

        const text = fs.readFileSync(alpha(), 'utf8');
        fs.writeFileSync(alpha(), text.replace('- Fix bug', '- [x] Fix bug'));
        await agent.post('/api/todo-md/rescan');
        const fix = await Task.findOne({ where: { name: 'Fix bug' } });
        expect(fix.status).toBe(2);
        expect(fix.completed_at).not.toBeNull();

        fs.writeFileSync(alpha(), text);
        await agent.post('/api/todo-md/rescan');
        await fix.reload();
        expect(fix.status).toBe(0);
        expect(fix.completed_at).toBeNull();
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

        const res = await agent.post('/api/task').send({
            name: 'Brand new',
            project_uid: project.uid,
            tags: ['code'],
        });

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

        await agent.post('/api/task').send({
            name: 'First next',
            project_uid: project.uid,
            tags: ['code'],
        });

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
        expect(movedTag.name).toBe('code');
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

    it('lets a linked project be renamed, keeps the name on reread, refuses deleting it', async () => {
        await agent.post('/api/todo-md/rescan');
        const project = await Project.findOne({ where: { name: 'alpha' } });

        const rename = await agent
            .patch(`/api/project/${project.uid}`)
            .send({ name: 'Other' });
        expect(rename.status).toBe(200);
        await agent.post('/api/todo-md/rescan');
        await project.reload();
        expect(project.name).toBe('Other');
        const del = await agent.delete(`/api/project/${project.uid}`);
        expect(del.status).toBe(403);
        const pin = await agent
            .patch(`/api/project/${project.uid}`)
            .send({ pin_to_sidebar: true });
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

            const code = await Tag.findOne({ where: { name: 'code' } });
            const res = await push([
                upsert('create-1', 'task', 'devicetask0001', {
                    name: 'From the phone',
                    project_uid: project.uid,
                    priority: 2,
                    tag_uids: [code.uid],
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

    describe('linking a file to a project', () => {
        const fileOf = (res, folder) =>
            res.body.files.find((f) => f.folder === folder);

        it('lists the files and the project each one feeds', async () => {
            fs.mkdirSync(path.join(root, 'gamma'));
            fs.writeFileSync(path.join(root, 'gamma', 'TODO.md'), '## Next\n');
            const alphaProject = await Project.findOne({
                where: { name: 'alpha' },
            });

            const res = await agent.get('/api/todo-md/files');

            expect(res.status).toBe(200);
            expect(res.body.files.map((f) => f.folder)).toEqual([
                'alpha',
                'beta',
                'gamma',
            ]);
            expect(fileOf(res, 'alpha')).toMatchObject({
                path: 'alpha/TODO.md',
                project_uid: alphaProject.uid,
                project_name: 'alpha',
            });
            expect(fileOf(res, 'gamma').project_uid).toBeNull();
        });

        it('creates nothing for a file no project is linked to', async () => {
            fs.mkdirSync(path.join(root, 'gamma'));
            fs.writeFileSync(
                path.join(root, 'gamma', 'TODO.md'),
                '## Next\n- Waiting\n'
            );

            await agent.post('/api/todo-md/rescan');

            expect(await Project.count({ where: { name: 'gamma' } })).toBe(0);
            expect(await Task.count({ where: { name: 'Waiting' } })).toBe(0);
        });

        it('links a chosen file to an existing project and reads it at once', async () => {
            fs.mkdirSync(path.join(root, 'gamma'));
            fs.writeFileSync(
                path.join(root, 'gamma', 'TODO.md'),
                '## Next\n- From the file\n'
            );
            const project = await Project.create({
                name: 'Launch',
                user_id: user.id,
            });
            const marketing = await Task.create({
                name: 'Write the press kit',
                user_id: user.id,
                project_id: project.id,
            });

            const res = await agent
                .post(`/api/todo-md/projects/${project.uid}/link`)
                .send({ folder: 'gamma' });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                project_uid: project.uid,
                path: 'gamma/TODO.md',
            });
            await project.reload();
            expect(project.name).toBe('Launch');
            expect(project.source_type).toBe('todo_md');
            expect(project.source_path).toBe('gamma/TODO.md');
            const fromFile = await Task.findOne({
                where: { name: 'From the file' },
            });
            expect(fromFile.project_id).toBe(project.id);
            await marketing.reload();
            expect(marketing.source_key).toBeNull();
        });

        it('refuses a file already linked, a linked project, and a bad folder', async () => {
            const plain = await Project.create({
                name: 'Plain',
                user_id: user.id,
            });
            const linked = await Project.findOne({ where: { name: 'alpha' } });
            const taken = await agent
                .post(`/api/todo-md/projects/${plain.uid}/link`)
                .send({ folder: 'alpha' });
            expect(taken.status).toBe(409);
            const twice = await agent
                .post(`/api/todo-md/projects/${linked.uid}/link`)
                .send({ folder: 'empty' });
            expect(twice.status).toBe(409);
            for (const folder of ['..', 'empty', 'a/b', '', 7]) {
                const bad = await agent
                    .post(`/api/todo-md/projects/${plain.uid}/link`)
                    .send({ folder });
                expect(bad.status).toBeGreaterThanOrEqual(400);
                expect(bad.status).toBeLessThan(500);
            }
            await plain.reload();
            expect(plain.source_type).toBeNull();
        });

        it('only lets the owning account list or link', async () => {
            const other = await signIn('other2@example.com');
            const plain = await Project.create({
                name: 'Plain',
                user_id: user.id,
            });
            expect((await other.agent.get('/api/todo-md/files')).status).toBe(
                403
            );
            const res = await other.agent
                .post(`/api/todo-md/projects/${plain.uid}/link`)
                .send({ folder: 'empty' });
            expect(res.status).toBe(403);
        });

        it('unlinks: tasks stay as ordinary ones, the file is untouched, relinking does not duplicate', async () => {
            await agent.post('/api/todo-md/rescan');
            const project = await Project.findOne({ where: { name: 'alpha' } });
            const before = fs.readFileSync(alpha(), 'utf8');
            const count = await Task.count({
                where: { project_id: project.id },
            });

            const res = await agent.post(
                `/api/todo-md/projects/${project.uid}/unlink`
            );

            expect(res.status).toBe(200);
            await project.reload();
            expect(project.source_type).toBeNull();
            expect(project.source_path).toBeNull();
            const tasks = await Task.findAll({
                where: { project_id: project.id },
            });
            expect(tasks).toHaveLength(count);
            expect(tasks.every((t) => t.source_key === null)).toBe(true);
            expect(fs.readFileSync(alpha(), 'utf8')).toBe(before);

            const edit = await agent
                .patch(`/api/task/${tasks[0].uid}`)
                .send({ name: 'Free again' });
            expect(edit.status).toBe(200);
            await tasks[0].reload();
            await tasks[0].update({ name: 'Ship the thing' });

            const again = await agent
                .post(`/api/todo-md/projects/${project.uid}/link`)
                .send({ folder: 'alpha' });
            expect(again.status).toBe(200);
            expect(
                await Task.count({ where: { project_id: project.id } })
            ).toBe(count);
            expect(fs.readFileSync(alpha(), 'utf8')).toBe(before);
        });
    });

    describe('a project holding file tasks and Cadence tasks', () => {
        let project;
        beforeEach(async () => {
            await agent.post('/api/todo-md/rescan');
            project = await Project.findOne({ where: { name: 'alpha' } });
        });

        it('keeps a task without the code tag out of the file, editable', async () => {
            const before = fs.readFileSync(alpha(), 'utf8');

            const res = await agent.post('/api/task').send({
                name: 'Plan the campaign',
                project_uid: project.uid,
                tags: ['marketing'],
            });

            expect(res.status).toBe(201);
            expect(fs.readFileSync(alpha(), 'utf8')).toBe(before);
            const edit = await agent
                .patch(`/api/task/${res.body.uid}`)
                .send({ name: 'Plan the launch', priority: 2 });
            expect(edit.status).toBe(200);
            await agent.post('/api/todo-md/rescan');
            const task = await Task.findOne({
                where: { name: 'Plan the launch' },
            });
            expect(task).not.toBeNull();
            expect(task.source_key).toBeNull();
            const removed = await agent.delete(`/api/task/${res.body.uid}`);
            expect(removed.status).toBe(200);
        });

        it('keeps a device task without the code tag out of the file', async () => {
            const before = fs.readFileSync(alpha(), 'utf8');
            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    {
                        op_id: 'plain-1',
                        entity: 'task',
                        uid: 'deviceplain001',
                        action: 'upsert',
                        fields: {
                            name: { value: 'Call the printer', hlc: hlc(5000) },
                            project_uid: {
                                value: project.uid,
                                hlc: hlc(5000),
                            },
                        },
                    },
                ],
            });
            expect(res.body.results[0].status).toBe('applied');
            expect(fs.readFileSync(alpha(), 'utf8')).toBe(before);
            const task = await Task.findOne({
                where: { uid: 'deviceplain001' },
            });
            expect(task.source_key).toBeNull();
        });

        it('moves an existing task into Next once it gets the code tag', async () => {
            const res = await agent.post('/api/task').send({
                name: 'Fix the export',
                note: 'seen on Android',
                project_uid: project.uid,
            });
            await agent
                .patch(`/api/task/${res.body.uid}`)
                .send({ tags: [{ name: 'code' }] });

            await watcher.scan();

            expect(fs.readFileSync(alpha(), 'utf8')).toContain(
                '- Fix bug\n- Fix the export\n  seen on Android\n'
            );
            const task = await Task.findOne({
                where: { uid: res.body.uid },
            });
            expect(task.source_section).toBe('Next');
            expect(task.source_key).not.toBeNull();
            await agent.post('/api/todo-md/rescan');
            expect(
                await Task.count({ where: { name: 'Fix the export' } })
            ).toBe(1);
            expect(
                fs.readFileSync(alpha(), 'utf8').split('- Fix the export\n')
            ).toHaveLength(2);
            watcher.stop();
        });

        it('leaves closed tasks and tasks of unlinked projects alone', async () => {
            const plain = await Project.create({
                name: 'Plain',
                user_id: user.id,
            });
            const outside = await agent.post('/api/task').send({
                name: 'Outside task',
                project_uid: plain.uid,
                tags: ['code'],
            });
            const closed = await agent.post('/api/task').send({
                name: 'Closed task',
                project_uid: project.uid,
            });
            await agent
                .patch(`/api/task/${closed.body.uid}`)
                .send({ tags: [{ name: 'code' }], status: 2 });
            const before = fs.readFileSync(alpha(), 'utf8');

            await watcher.scan();

            expect(fs.readFileSync(alpha(), 'utf8')).toBe(before);
            const task = await Task.findOne({
                where: { uid: outside.body.uid },
            });
            expect(task.source_key).toBeNull();
            watcher.stop();
        });

        it('puts the code tag back and keeps other tags on a mirrored task', async () => {
            const [ship] = await tasksOf('alpha');
            const {
                updateTaskTags,
            } = require('../../modules/tasks/operations/tags');
            await updateTaskTags(ship, ['perso'], user.id);

            await agent.post('/api/todo-md/rescan');

            const again = await Task.findByPk(ship.id, { include: [Tag] });
            expect(again.Tags.map((t) => t.name).sort()).toEqual([
                'code',
                'perso',
            ]);
        });

        it('tells devices which tasks come from the file', async () => {
            const res = await agent.post('/api/task').send({
                name: 'Only here',
                project_uid: project.uid,
            });
            const snap = await agent.get('/api/v1/sync/snapshot?entity=task');
            const [ship] = await tasksOf('alpha');
            const rows = new Map(snap.body.rows.map((r) => [r.uid, r]));
            expect(rows.get(ship.uid).source_key).toBeTruthy();
            expect(rows.get(res.body.uid).source_key).toBeNull();
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
                    tags: ['code'],
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

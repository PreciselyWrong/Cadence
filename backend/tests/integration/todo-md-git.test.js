const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const request = require('supertest');
const app = require('../../app');
const { Task, Project, Tag } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// A TODO.md that lives in a git repository: a local bare repository stands
// for Gitea/GitHub, and a second clone ("dev") for someone pushing to it.

const TODO = [
    '# Demo',
    '',
    '## Now',
    '- Ship the thing',
    '',
    '## Next',
    '- [ ] Write docs',
    '- Fix bug',
    '',
    '## Ideas',
    '- Maybe a widget',
    '',
].join('\n');
const SECRET = 'webhook-secret';

const gitEnv = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
};
const git = (cwd, ...args) =>
    execFileSync(
        'git',
        [
            '-c',
            'user.name=Dev',
            '-c',
            'user.email=dev@example.com',
            '-c',
            'commit.gpgsign=false',
            ...args,
        ],
        {
            cwd,
            env: gitEnv,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

const signIn = async (email) => {
    const user = await createTestUser({ email });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email, password: 'password123' });
    return { user, agent };
};

const sign = (body) =>
    crypto.createHmac('sha256', SECRET).update(body).digest('hex');

describe('TODO.md projects from a git repository', () => {
    let tmp;
    let bare;
    let dev;
    let agent;

    const remoteText = () => git(bare, 'show', 'main:TODO.md');
    const remoteAuthor = () => git(bare, 'log', '-1', '--format=%an <%ae>');
    const remoteCommits = () =>
        Number(git(bare, 'rev-list', '--count', 'main').trim());
    const devPush = (edit) => {
        git(dev, 'fetch', 'origin');
        git(dev, 'reset', '--hard', 'origin/main');
        const file = path.join(dev, 'TODO.md');
        fs.writeFileSync(file, edit(fs.readFileSync(file, 'utf8')));
        git(dev, 'commit', '-am', 'dev edit');
        git(dev, 'push', 'origin', 'HEAD:main');
    };
    const project = () =>
        Project.findOne({
            where: { source_type: 'todo_md', source_path: 'git:demo' },
        });
    const taskNamed = async (name) =>
        Task.findOne({ where: { project_id: (await project()).id, name } });
    const names = async () =>
        (
            await Task.findAll({
                where: { project_id: (await project()).id },
                order: [['id', 'ASC']],
            })
        ).map((t) => t.name);
    const repoStatus = async () =>
        (await agent.get('/api/todo-md/status')).body.repos.find(
            (r) => r.slug === 'demo'
        );
    const webhook = (payload, headers) =>
        request(app)
            .post('/api/todo-md/webhook/demo')
            .set('Content-Type', 'application/json')
            .set(headers)
            .send(payload);

    beforeEach(async () => {
        tmp = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'todo-git-'))
        );
        bare = path.join(tmp, 'remote.git');
        dev = path.join(tmp, 'dev');
        git(tmp, 'init', '--quiet', '--bare', '-b', 'main', bare);
        git(tmp, 'clone', '--quiet', bare, dev);
        git(dev, 'checkout', '--quiet', '-b', 'main');
        fs.writeFileSync(path.join(dev, 'TODO.md'), TODO);
        fs.writeFileSync(path.join(dev, 'README.md'), 'readme\n');
        git(dev, 'add', '.');
        git(dev, 'commit', '--quiet', '-m', 'init');
        git(dev, 'push', '--quiet', 'origin', 'HEAD:main');

        process.env.TUDUDI_TODO_REPOS = 'demo';
        process.env.TUDUDI_TODO_REPO_DEMO_URL = bare;
        process.env.TUDUDI_TODO_REPO_DEMO_BRANCH = 'main';
        process.env.TUDUDI_TODO_REPO_DEMO_WEBHOOK_SECRET = SECRET;
        process.env.TUDUDI_TODO_GIT_DIR = path.join(tmp, 'clones');
        ({ agent } = await signIn('git-todo@example.com'));
    });

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            if (key.startsWith('TUDUDI_TODO_')) delete process.env[key];
        }
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('reads the repository TODO.md into a project', async () => {
        const res = await agent.post('/api/todo-md/rescan');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ projects: 1, created: 4 });
        expect((await project()).name).toBe('demo');
        expect(await names()).toEqual([
            'Ship the thing',
            'Write docs',
            'Fix bug',
            'Maybe a widget',
        ]);
        const status = await repoStatus();
        expect(status).toMatchObject({
            repo: bare.replace(/\.git$/, ''),
            branch: 'main',
            path: 'TODO.md',
            project_uid: (await project()).uid,
            last_error: null,
            pending: [],
        });
        expect(status.head_sha).toMatch(/^[0-9a-f]{40}$/);
        expect(status.synced_at).not.toBeNull();
    });

    it('commits and pushes an added task and a check mark as Cadence', async () => {
        await agent.post('/api/todo-md/rescan');
        const { uid } = await project();

        const added = await agent
            .post('/api/task')
            .send({ name: 'From Cadence', project_uid: uid, tags: ['code'] });
        expect(added.status).toBe(201);
        expect(remoteText()).toBe(
            TODO.replace('- Fix bug\n', '- Fix bug\n- From Cadence\n')
        );
        expect(remoteAuthor().trim()).toBe('Cadence <cadence@localhost>');

        const docs = await taskNamed('Write docs');
        const done = await agent
            .patch(`/api/task/${docs.uid}`)
            .send({ status: 2 });
        expect(done.status).toBe(200);
        expect(done.body.status).toBe(2);
        expect(remoteText()).toContain('- [x] Write docs\n');
        expect(remoteAuthor().trim()).toBe('Cadence <cadence@localhost>');
        expect(git(bare, 'show', '--stat', '--format=', 'main')).toMatch(
            /TODO\.md/
        );
        expect(git(bare, 'show', 'main:README.md')).toBe('readme\n');
    });

    it('reads a push reported by a signed GitHub or Gitea webhook', async () => {
        await agent.post('/api/todo-md/rescan');
        devPush((text) => text.replace('- Fix bug\n', '- Fix bug\n- Pushed\n'));
        const payload = JSON.stringify({ ref: 'refs/heads/main' });

        const github = await webhook(payload, {
            'X-GitHub-Event': 'push',
            'X-Hub-Signature-256': `sha256=${sign(payload)}`,
        });
        expect(github.status).toBe(200);
        expect(github.body).toMatchObject({ synced: true, created: 1 });
        expect(await taskNamed('Pushed')).not.toBeNull();

        devPush((text) => text.replace('- Pushed\n', '- [x] Pushed\n'));
        const gitea = await webhook(payload, {
            'X-Gitea-Event': 'push',
            'X-Gitea-Signature': sign(payload),
        });
        expect(gitea.status).toBe(200);
        expect((await taskNamed('Pushed')).status).toBe(2);

        const other = JSON.stringify({ ref: 'refs/heads/feature' });
        const ignored = await webhook(other, {
            'X-Hub-Signature-256': `sha256=${sign(other)}`,
        });
        expect(ignored.status).toBe(202);
        expect(ignored.body.synced).toBe(false);
    });

    it('refuses a webhook without a valid signature or for an unknown repo', async () => {
        const payload = JSON.stringify({ ref: 'refs/heads/main' });
        const missing = await webhook(payload, {});
        expect(missing.status).toBe(401);
        const wrong = await webhook(payload, {
            'X-Hub-Signature-256': `sha256=${'0'.repeat(64)}`,
        });
        expect(wrong.status).toBe(401);
        const tampered = await webhook('{"ref":"x"}', {
            'X-Gitea-Signature': sign(payload),
        });
        expect(tampered.status).toBe(401);

        const unknown = await request(app)
            .post('/api/todo-md/webhook/nope')
            .set('X-Hub-Signature-256', `sha256=${sign(payload)}`)
            .send(payload);
        expect(unknown.status).toBe(404);
        expect(await Project.count({ where: { source_type: 'todo_md' } })).toBe(
            0
        );
    });

    it('keeps edits from both sides', async () => {
        await agent.post('/api/todo-md/rescan');
        // Pushed while Cadence has not read it yet (no webhook).
        devPush((text) =>
            text.replace(
                '- Maybe a widget\n',
                '- Maybe a widget\n- Remote idea\n'
            )
        );
        const fix = await taskNamed('Fix bug');

        const res = await agent.patch(`/api/task/${fix.uid}`).send({
            status: 2,
        });

        expect(res.status).toBe(200);
        const text = remoteText();
        expect(text).toContain('- [x] Fix bug\n');
        expect(text).toContain('- Remote idea\n');
        expect(await taskNamed('Remote idea')).not.toBeNull();
        expect((await taskNamed('Fix bug')).status).toBe(2);
    });

    it('writes nothing and flags a conflict when the line changed in the repository', async () => {
        await agent.post('/api/todo-md/rescan');
        const fix = await taskNamed('Fix bug');
        devPush((text) => text.replace('- Fix bug\n', '- Fix the bug\n'));
        const commits = remoteCommits();
        const before = remoteText();

        const res = await agent.patch(`/api/task/${fix.uid}`).send({
            status: 2,
        });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('todo_md_conflict');
        expect(remoteCommits()).toBe(commits);
        expect(remoteText()).toBe(before);
        expect(await taskNamed('Fix the bug')).not.toBeNull();
        const status = await repoStatus();
        expect(status.pending).toEqual([
            expect.objectContaining({
                op: 'done',
                name: 'Fix bug',
                done: true,
                reason: 'conflict',
            }),
        ]);

        const discarded = await agent.post('/api/todo-md/repos/demo/discard');
        expect(discarded.status).toBe(200);
        expect(discarded.body.pending).toEqual([]);
        expect(remoteCommits()).toBe(commits);
    });

    it('keeps an edit pending while the repository is unreachable, then retries it', async () => {
        await agent.post('/api/todo-md/rescan');
        const docs = await taskNamed('Write docs');
        process.env.TUDUDI_TODO_REPO_DEMO_URL = path.join(tmp, 'gone.git');

        const res = await agent.patch(`/api/task/${docs.uid}`).send({
            status: 2,
        });

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('todo_md_repo_unreachable');
        expect(remoteText()).toBe(TODO);
        const waiting = await repoStatus();
        expect(waiting.pending).toEqual([
            expect.objectContaining({ op: 'done', reason: 'unreachable' }),
        ]);
        expect(waiting.last_error).toMatch(/git/);

        process.env.TUDUDI_TODO_REPO_DEMO_URL = bare;
        const retried = await agent.post('/api/todo-md/repos/demo/retry');

        expect(retried.status).toBe(200);
        expect(retried.body.pending).toEqual([]);
        expect(retried.body.last_error).toBeNull();
        expect(remoteText()).toContain('- [x] Write docs\n');
        expect((await taskNamed('Write docs')).status).toBe(2);
    });

    it('keeps an added task pending while unreachable, then adds it on retry', async () => {
        await agent.post('/api/todo-md/rescan');
        const { uid } = await project();
        process.env.TUDUDI_TODO_REPO_DEMO_URL = path.join(tmp, 'gone.git');

        const res = await agent
            .post('/api/task')
            .send({ name: 'Later', project_uid: uid, tags: ['code'] });
        expect(res.status).toBe(503);
        expect(await taskNamed('Later')).toBeNull();

        process.env.TUDUDI_TODO_REPO_DEMO_URL = bare;
        await agent.post('/api/todo-md/repos/demo/retry');
        expect(remoteText()).toContain('- Fix bug\n- Later\n');
        expect(await taskNamed('Later')).not.toBeNull();
    });

    it('pushes a task created and one checked on a device', async () => {
        await agent.post('/api/todo-md/rescan');
        const { uid } = await project();
        const docs = await taskNamed('Write docs');
        const field = (value) => ({
            value,
            hlc: '0000000005000-0000-devA',
        });
        const code = await Tag.findOne({ where: { name: 'code' } });

        const res = await agent.post('/api/v1/sync/push').send({
            ops: [
                {
                    op_id: 'git-create-1',
                    entity: 'task',
                    uid: 'devicegittask1',
                    action: 'upsert',
                    fields: {
                        name: field('From the phone'),
                        project_uid: field(uid),
                        tag_uids: field([code.uid]),
                    },
                },
                {
                    op_id: 'git-done-1',
                    entity: 'task',
                    uid: docs.uid,
                    action: 'upsert',
                    fields: { status: field(2) },
                },
            ],
        });

        expect(res.body.results.map((r) => r.status)).toEqual([
            'applied',
            'applied',
        ]);
        const text = remoteText();
        expect(text).toContain('- Fix bug\n- From the phone\n');
        expect(text).toContain('- [x] Write docs\n');
        expect((await taskNamed('From the phone')).uid).toBe('devicegittask1');
    });

    it('leaves the token out of URLs, arguments and errors', async () => {
        const { scrub } = require('../../modules/todo-md/git');
        const repo = { token: 'tok-secret-123' };
        expect(
            scrub(
                'fatal: unable to access https://u:tok-secret-123@host/x.git',
                repo
            )
        ).toBe('fatal: unable to access https://***@host/x.git');
    });
});

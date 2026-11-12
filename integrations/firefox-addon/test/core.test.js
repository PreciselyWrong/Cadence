'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core');

test('a server address becomes a clean base', () => {
    assert.equal(core.normalizeServer(' https://cadence.example/ '), 'https://cadence.example');
    assert.equal(core.normalizeServer('https://a.example/cadence//'), 'https://a.example/cadence');
    assert.equal(core.normalizeServer('pas une adresse'), null);
    assert.equal(core.normalizeServer('ftp://a.example'), null);
});

test('plain http is only accepted on a private network', () => {
    assert.equal(core.normalizeServer('http://cadence.example'), null);
    assert.equal(core.normalizeServer('http://cadence.lan'), 'http://cadence.lan');
    assert.equal(core.normalizeServer('http://192.168.1.10:3002'), 'http://192.168.1.10:3002');
    assert.equal(core.normalizeServer('http://100.64.0.1'), 'http://100.64.0.1');
    assert.equal(core.normalizeServer('http://172.32.0.1'), null);
});

test('only web pages can be saved', () => {
    assert.equal(core.isSavable('https://a.example/x'), true);
    assert.equal(core.isSavable('about:config'), false);
    assert.equal(core.isSavable('file:///tmp/a'), false);
    assert.equal(core.isSavable(undefined), false);
});

test('a page becomes a task: the request carries the token and only what was filled', () => {
    const { url, options } = core.taskRequest(
        { server: 'https://c.example', token: 'tt_x' },
        { url: 'https://a.example/p', name: ' Lire : Titre ', title: 'Titre' }
    );
    assert.equal(url, 'https://c.example/api/links/task');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer tt_x');
    assert.deepEqual(JSON.parse(options.body), {
        url: 'https://a.example/p',
        name: 'Lire : Titre',
        title: 'Titre',
    });
    assert.deepEqual(core.taskBody({ url: 'https://a.example', name: ' ' }), {
        url: 'https://a.example',
    });
});

test('the lookup asks where the page already is, with its title', () => {
    const { url, options } = core.lookupRequest(
        { server: 'https://c.example', token: 't' },
        { url: 'https://a.example/p?x=1', title: 'T' }
    );
    assert.equal(
        url,
        'https://c.example/api/links/lookup?url=https%3A%2F%2Fa.example%2Fp%3Fx%3D1&title=T'
    );
    assert.equal(options.headers.Authorization, 'Bearer t');
});

test('what the lookup found is said with the first place and how many more', () => {
    assert.equal(core.firstPlace({ tasks: [], projects: [] }), null);
    assert.deepEqual(
        core.firstPlace({
            tasks: [{ uid: 't1', name: 'Essayer : X' }],
            projects: [{ uid: 'p1', name: 'P' }],
        }),
        { name: 'Essayer : X', path: '/task/t1', more: 1 }
    );
    assert.deepEqual(
        core.firstPlace({ tasks: [], projects: [{ uid: 'p1', name: 'P' }] }),
        { name: 'P', path: '/project/p1', more: 0 }
    );
});

test('the answer of the server says what happened', async () => {
    const answering = (status, body) => async () => ({ status, json: async () => body });
    const settings = { server: 'https://c.example', token: 't' };
    const page = { url: 'https://a.example' };
    assert.equal(await core.addTask(answering(201, { task: {} }), settings, page), 'saved');
    assert.equal(await core.addTask(answering(401), settings, page), 'bad_token');
    assert.equal(await core.addTask(answering(400), settings, page), 'refused');
    assert.equal(await core.addTask(answering(500), settings, page), 'failed');
    const offline = async () => {
        throw new Error('offline');
    };
    assert.equal(await core.addTask(offline, settings, page), 'unreachable');
    assert.equal(await core.lookup(offline, settings, page), null);
    assert.deepEqual(
        await core.lookup(answering(200, { task_name: 'N', tasks: [], projects: [] }), settings, page),
        { task_name: 'N', tasks: [], projects: [] }
    );
});

test('the permission asked for a server names its host, never a port', () => {
    assert.equal(core.originPattern('http://100.64.0.1:3002'), 'http://100.64.0.1/*');
    assert.equal(core.originPattern('https://cadence.example/app'), 'https://cadence.example/*');
});

test('a tab or a whole tab group goes to a project as its pages', () => {
    const { url, options } = core.sendPagesRequest(
        { server: 'https://c.example', token: 't' },
        'p1',
        [
            { url: 'https://a.example/1', title: ' One ' },
            { url: 'about:blank', title: 'skip' },
            { url: 'https://a.example/2', title: '' },
        ]
    );
    assert.equal(url, 'https://c.example/api/projects/p1/pages');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
        pages: [{ url: 'https://a.example/1', title: 'One' }, { url: 'https://a.example/2' }],
    });
});

test('open projects are offered, by name; done and archived ones are not', () => {
    assert.deepEqual(
        core.openProjects({
            projects: [
                { uid: 'b', name: 'Beta', status: 'in_progress' },
                { uid: 'x', name: 'Old', status: 'done' },
                { uid: 'a', name: 'alpha', status: 'planned' },
                { uid: 'z', name: 'Gone', status: 'archived' },
            ],
        }),
        [
            { uid: 'a', name: 'alpha' },
            { uid: 'b', name: 'Beta' },
        ]
    );
});

test('the pages of a project are read to open them', () => {
    const { url } = core.pagesRequest({ server: 'https://c.example', token: 't' }, 'p1');
    assert.equal(url, 'https://c.example/api/projects/p1/pages');
    assert.deepEqual(core.pageUrls({ pages: [{ url: 'https://a' }, { url: 'https://b' }] }), [
        'https://a',
        'https://b',
    ]);
});

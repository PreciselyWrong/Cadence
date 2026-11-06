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

test('the request carries the token and only what was filled', () => {
    const { url, options } = core.saveRequest(
        { server: 'https://c.example', token: 'tt_x' },
        { url: 'https://a.example', title: ' Titre ', note: ' ', status: 'to_evaluate', tags: '#dev, lecture, dev' }
    );
    assert.equal(url, 'https://c.example/api/links');
    assert.equal(options.headers.Authorization, 'Bearer tt_x');
    assert.deepEqual(JSON.parse(options.body), {
        url: 'https://a.example',
        title: 'Titre',
        status: 'to_evaluate',
        tags: ['dev', 'lecture'],
    });
});

test('an unknown status is left to the server default', () => {
    assert.deepEqual(core.linkBody({ url: 'https://a.example', status: 'dropped' }), {
        url: 'https://a.example',
    });
});

test('the answer of the server says what happened', async () => {
    const answering = (status, body) => async () => ({ status, json: async () => body });
    const settings = { server: 'https://c.example', token: 't' };
    const link = { url: 'https://a.example' };
    assert.equal(await core.save(answering(200, { created: true }), settings, link), 'saved');
    assert.equal(await core.save(answering(200, { created: false }), settings, link), 'already');
    assert.equal(await core.save(answering(401), settings, link), 'bad_token');
    assert.equal(await core.save(answering(400), settings, link), 'refused');
    assert.equal(await core.save(answering(500), settings, link), 'failed');
    const offline = async () => {
        throw new Error('offline');
    };
    assert.equal(await core.save(offline, settings, link), 'unreachable');
});

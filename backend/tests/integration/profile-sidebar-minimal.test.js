'use strict';

const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

describe('PUT /api/v1/profile/sidebar-settings (minimal sidebar)', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'test@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'test@example.com',
            password: 'password123',
        });
    });

    const save = (body) =>
        agent.put('/api/v1/profile/sidebar-settings').send(body);

    const stored = async () =>
        (await agent.get('/api/v1/profile')).body.sidebar_settings;

    it('stores smart list visibility and count badges', async () => {
        const response = await save({
            smartLists: [
                { key: 'inbox', visible: false, showCount: true },
                { key: 'today', visible: true, showCount: false },
            ],
        });

        expect(response.status).toBe(200);
        expect((await stored()).smartLists).toEqual([
            { key: 'inbox', visible: false, showCount: true },
            { key: 'today', visible: true, showCount: false },
        ]);
    });

    it('drops unknown smart list keys and duplicates, and coerces booleans', async () => {
        await save({
            smartLists: [
                { key: 'bogus', visible: true, showCount: true },
                { key: 'today', visible: 'false', showCount: 0 },
                { key: 'today', visible: true, showCount: true },
                'tomorrow',
                { key: 'tomorrow', visible: 1 },
            ],
        });

        expect((await stored()).smartLists).toEqual([
            { key: 'today', visible: false, showCount: false },
            { key: 'tomorrow', visible: true, showCount: true },
        ]);
    });

    it('keeps only known rail keys with a known place', async () => {
        await save({
            rail: [
                { key: 'templates', place: 'more' },
                { key: 'calendar', place: 'nowhere' },
                { key: 'nope', place: 'rail' },
                { key: 'inbox', place: 'hidden' },
            ],
        });

        expect((await stored()).rail).toEqual([
            { key: 'templates', place: 'more' },
            { key: 'inbox', place: 'hidden' },
        ]);
    });

    it('stores section count badges for known sections only', async () => {
        await save({
            sectionBadges: { projects: false, tags: 'yes', bogus: false },
        });

        expect((await stored()).sectionBadges).toEqual({
            projects: false,
            tags: true,
        });
    });

    it('keeps the minimal settings when other sidebar settings change', async () => {
        await save({ smartLists: [{ key: 'next7', visible: false }] });
        await save({ visibleSections: { notes: false } });

        expect((await stored()).smartLists).toEqual([
            { key: 'next7', visible: false, showCount: true },
        ]);
    });

    it.each([
        ['a string', 'today'],
        ['an object', {}],
        [
            'too many entries',
            Array.from({ length: 51 }, () => ({ key: 'today' })),
        ],
    ])('rejects smartLists that is %s', async (_n, value) => {
        const response = await save({ smartLists: value });
        expect(response.status).toBe(400);
    });

    it('rejects a rail that is not an array and a non-object sectionBadges', async () => {
        expect((await save({ rail: 'more' })).status).toBe(400);
        expect((await save({ sectionBadges: [] })).status).toBe(400);
    });
});

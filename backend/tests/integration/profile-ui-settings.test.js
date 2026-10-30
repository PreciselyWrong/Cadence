'use strict';

const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

describe('PUT /api/profile/ui-settings', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'test@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'test@example.com',
            password: 'password123',
        });
    });

    it('saves the projects someday setting', async () => {
        await agent
            .put('/api/profile/ui-settings')
            .send({ project: { list: { showSomeday: true } } });

        const profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.project.list).toEqual({
            showSomeday: true,
        });
    });

    it('saves the projects completed setting', async () => {
        await agent.put('/api/profile/ui-settings').send({
            project: { list: { showSomeday: false, showCompleted: true } },
        });

        const profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.project.list).toEqual({
            showSomeday: false,
            showCompleted: true,
        });
    });

    it('keeps the list filters when project details change', async () => {
        await agent
            .put('/api/profile/ui-settings')
            .send({ project: { list: { showSomeday: true } } });
        await agent
            .put('/api/profile/ui-settings')
            .send({ project: { details: { showMetrics: false } } });

        const profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.project.list.showSomeday).toBe(true);
        expect(profile.body.ui_settings.project.details.showMetrics).toBe(
            false
        );
    });

    it('saves the calendar view options, dropping unknown values', async () => {
        await agent.put('/api/profile/ui-settings').send({
            calendar: {
                showCompleted: false,
                colorBy: 'project',
                multiDayCount: 4,
                showWeekNumbers: true,
                showMiniCalendar: 'yes',
            },
        });
        await agent.put('/api/profile/ui-settings').send({
            calendar: {
                showWeekends: false,
                colorBy: 'rainbow',
                multiDayCount: 30,
                extra: 1,
            },
        });

        const profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.calendar).toEqual({
            showCompleted: false,
            showWeekends: false,
            colorBy: 'project',
            multiDayCount: 4,
            showWeekNumbers: true,
        });
    });

    describe('visible hours', () => {
        it('saves a valid visible hours range', async () => {
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: 5, end: 22 } },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.calendar.visibleHours).toEqual({
                start: 5,
                end: 22,
            });
        });

        it('keeps the saved range when a range is invalid', async () => {
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: 5, end: 22 } },
            });
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: 10, end: 10 } },
            });
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: 0, end: 25 } },
            });
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: -1, end: 4 } },
            });
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: 2.5, end: 9 } },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.calendar.visibleHours).toEqual({
                start: 5,
                end: 22,
            });
        });

        it('keeps visible hours when the profile form saves', async () => {
            await agent.put('/api/profile/ui-settings').send({
                calendar: { visibleHours: { start: 6, end: 20 } },
            });
            await agent.patch('/api/profile').send({
                ui_settings: { appearance: { density: 'dense' } },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.calendar.visibleHours).toEqual({
                start: 6,
                end: 20,
            });
        });
    });

    describe('interface density', () => {
        it('saves dense', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: { density: 'dense' },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance.density).toBe('dense');
        });

        it('drops an invalid density and keeps the saved one', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: { density: 'dense' },
            });
            await agent.put('/api/profile/ui-settings').send({
                appearance: { density: 'compact' },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance.density).toBe('dense');
        });

        it('keeps density when the profile form saves without it', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: { density: 'dense' },
            });
            await agent.patch('/api/profile').send({
                ui_settings: { appearance: { theme: 'dark' } },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance).toEqual({
                theme: 'dark',
                density: 'dense',
            });
        });

        it('drops an invalid density from a profile save', async () => {
            await agent.patch('/api/profile').send({
                ui_settings: { appearance: { density: 'compact' } },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance.density).toBeUndefined();
        });
    });

    describe('matrices', () => {
        const quadrant = (name, rule) => ({ name, rule });

        it('saves custom matrices, sanitizing the rules', async () => {
            const res = await agent.put('/api/profile/ui-settings').send({
                matrices: [
                    {
                        id: 'm1',
                        name: '  Work  ',
                        evil: 'x',
                        quadrants: [
                            quadrant('Now', {
                                priorities: ['high', 'bogus', 'high', 'none'],
                                due: { type: 'within', days: 3 },
                                tags: [' Urgent ', 'urgent', 42],
                                projects: ['p-uid'],
                                extra: true,
                            }),
                            quadrant('', {
                                due: { type: 'within', days: 999 },
                            }),
                            quadrant('Later', { due: { type: 'weird' } }),
                            quadrant('Rest', null),
                        ],
                    },
                    { id: 'default', name: 'x', quadrants: [] },
                ],
            });
            expect(res.status).toBe(200);

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.matrices).toEqual([
                {
                    id: 'm1',
                    name: 'Work',
                    quadrants: [
                        {
                            name: 'Now',
                            rule: {
                                priorities: ['none', 'high'],
                                due: { type: 'within', days: 3 },
                                tags: ['urgent'],
                                projects: ['p-uid'],
                            },
                        },
                        {
                            name: 'Q2',
                            rule: {
                                priorities: [],
                                due: { type: 'within', days: 7 },
                                tags: [],
                                projects: [],
                            },
                        },
                        {
                            name: 'Later',
                            rule: {
                                priorities: [],
                                due: { type: 'any' },
                                tags: [],
                                projects: [],
                            },
                        },
                        {
                            name: 'Rest',
                            rule: {
                                priorities: [],
                                due: { type: 'any' },
                                tags: [],
                                projects: [],
                            },
                        },
                    ],
                },
            ]);
        });

        it('rejects more than 10 matrices', async () => {
            const four = [1, 2, 3, 4].map((i) => quadrant(`Q${i}`, {}));
            const matrices = Array.from({ length: 11 }, (_, i) => ({
                id: `m${i}`,
                name: `M${i}`,
                quadrants: four,
            }));
            const res = await agent
                .put('/api/profile/ui-settings')
                .send({ matrices });
            expect(res.status).toBe(400);
        });

        it('rejects a matrix without four quadrants', async () => {
            const res = await agent.put('/api/profile/ui-settings').send({
                matrices: [{ id: 'm1', name: 'M', quadrants: [] }],
            });
            expect(res.status).toBe(400);
        });

        it('keeps matrices when another ui setting is saved', async () => {
            const four = [1, 2, 3, 4].map((i) => quadrant(`Q${i}`, {}));
            await agent.put('/api/profile/ui-settings').send({
                matrices: [{ id: 'm1', name: 'M', quadrants: four }],
            });
            await agent
                .put('/api/profile/ui-settings')
                .send({ inbox: { recentlyCapturedExpanded: true } });
            await agent
                .patch('/api/profile')
                .send({ ui_settings: { inbox: {} } });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.matrices).toHaveLength(1);
        });
    });

    it('saves a sanitized summary template', async () => {
        await agent.put('/api/profile/ui-settings').send({
            summary: { group_by: 'day', include_open: true, extra: 'x' },
        });
        let profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.summary).toEqual({
            group_by: 'day',
            include_open: true,
        });

        await agent
            .put('/api/profile/ui-settings')
            .send({ summary: { group_by: 'bogus' } });
        profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.summary).toEqual({
            group_by: 'project',
            include_open: false,
        });
    });

    describe('view types (list, board or calendar per view)', () => {
        it('saves a view type per key', async () => {
            await agent.put('/api/profile/ui-settings').send({
                viewTypes: {
                    'tag:work': 'board',
                    'view:abc123': 'calendar',
                    tasks: 'list',
                },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                'tag:work': 'board',
                'view:abc123': 'calendar',
                tasks: 'list',
            });
        });

        it('drops values other than list, board or calendar', async () => {
            await agent.put('/api/profile/ui-settings').send({
                viewTypes: {
                    tasks: 'timeline',
                    'project:p1': 'board',
                    'tag:x': 42,
                    'tag:y': null,
                },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                'project:p1': 'board',
            });
        });

        it('drops keys longer than 120 characters and blank keys', async () => {
            const longKey = `tag:${'a'.repeat(120)}`;
            await agent.put('/api/profile/ui-settings').send({
                viewTypes: {
                    [longKey]: 'list',
                    '   ': 'board',
                    'tag:ok': 'calendar',
                },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                'tag:ok': 'calendar',
            });
        });

        it('keeps a key of exactly 120 characters', async () => {
            const key = `tag:${'a'.repeat(116)}`;
            expect(key).toHaveLength(120);
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: { [key]: 'board' } });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                [key]: 'board',
            });
        });

        it('merges new choices into the saved map', async () => {
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: { tasks: 'board' } });
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: { 'tag:work': 'calendar' } });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                tasks: 'board',
                'tag:work': 'calendar',
            });
        });

        it('keeps at most 500 entries, dropping the oldest', async () => {
            const first = {};
            for (let i = 0; i < 300; i++) first[`tag:old${i}`] = 'list';
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: first });

            const second = {};
            for (let i = 0; i < 300; i++) second[`tag:new${i}`] = 'board';
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: second });

            const profile = await agent.get('/api/profile');
            const saved = profile.body.ui_settings.viewTypes;
            const keys = Object.keys(saved);
            expect(keys).toHaveLength(500);
            expect(saved['tag:new299']).toBe('board');
            expect(saved['tag:old0']).toBeUndefined();
            expect(saved['tag:old299']).toBe('list');
        });

        it('ignores a viewTypes value that is not an object', async () => {
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: { tasks: 'board' } });
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: ['board'] });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                tasks: 'board',
            });
        });

        it('keeps the view types when the profile form saves', async () => {
            await agent
                .put('/api/profile/ui-settings')
                .send({ viewTypes: { tasks: 'calendar' } });
            await agent.patch('/api/profile').send({
                ui_settings: { appearance: { density: 'minimal' } },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.viewTypes).toEqual({
                tasks: 'calendar',
            });
        });
    });

    describe('task row details (appearance.rowFields)', () => {
        const DEFAULT_ORDER = [
            'recurrence',
            'comments',
            'tags',
            'project',
            'priority',
            'due',
        ];

        it('saves the chosen order and visibility', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: {
                    rowFields: [
                        { key: 'due', visible: false },
                        { key: 'priority', visible: true },
                    ],
                },
            });

            const profile = await agent.get('/api/profile');
            const rowFields = profile.body.ui_settings.appearance.rowFields;
            expect(rowFields.slice(0, 2)).toEqual([
                { key: 'due', visible: false },
                { key: 'priority', visible: true },
            ]);
            expect(rowFields.map((f) => f.key).sort()).toEqual(
                [...DEFAULT_ORDER].sort()
            );
        });

        it('drops unknown keys, non-boolean visibility and repeats, and appends missing chips', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: {
                    rowFields: [
                        { key: 'due', visible: false },
                        { key: 'nope', visible: true },
                        { key: 'priority', visible: 'no' },
                        { key: 'due', visible: true },
                        { key: 'tags', visible: false },
                    ],
                },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance.rowFields).toEqual([
                { key: 'due', visible: false },
                { key: 'tags', visible: false },
                { key: 'recurrence', visible: true },
                { key: 'comments', visible: true },
                { key: 'project', visible: true },
                { key: 'priority', visible: true },
            ]);
        });

        it('falls back to the default order for a value that is not a list', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: { rowFields: 'tags' },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance.rowFields).toEqual(
                DEFAULT_ORDER.map((key) => ({ key, visible: true }))
            );
        });

        it('keeps the other appearance settings', async () => {
            await agent.put('/api/profile/ui-settings').send({
                appearance: { contentBackground: 'misty-forest' },
            });
            await agent.put('/api/profile/ui-settings').send({
                appearance: { rowFields: [{ key: 'tags', visible: false }] },
            });

            const profile = await agent.get('/api/profile');
            expect(profile.body.ui_settings.appearance.contentBackground).toBe(
                'misty-forest'
            );
        });
    });

    it('saves the Everyone column order, deduped and trimmed', async () => {
        const res = await agent.put('/api/profile/ui-settings').send({
            everyone: { column_order: [' b ', 'a', 'b', '', 7] },
        });
        expect(res.status).toBe(200);

        const profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.everyone).toEqual({
            column_order: ['b', 'a'],
        });
    });

    it('rejects a column order that is not a list', async () => {
        const res = await agent
            .put('/api/profile/ui-settings')
            .send({ everyone: { column_order: 'a,b' } });
        expect(res.status).toBe(400);
    });

    it('keeps the Everyone column order on a full profile save', async () => {
        await agent
            .put('/api/profile/ui-settings')
            .send({ everyone: { column_order: ['a', 'b'] } });
        await agent
            .patch('/api/profile')
            .send({ ui_settings: { project: { details: {} } } });

        const profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.everyone.column_order).toEqual([
            'a',
            'b',
        ]);
    });
});

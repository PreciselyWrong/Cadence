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
});

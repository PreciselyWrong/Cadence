'use strict';

const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const { Notification, Proposal, User } = require('../../models');
const dispatcher = require('../../modules/webhooks/dispatcher');
const registry = require('../../modules/plugins/registry');
const taskScheduler = require('../../modules/tasks/taskScheduler');
const { runMorningReplan } = require('../../modules/proposals/morning');
const { toolsFor } = require('../../modules/triage/actions');
const { createTestUser } = require('../helpers/testUtils');

describe('proposals morning run', () => {
    let user;
    let agent;
    let run;
    let emit;
    let apiKey;
    let today;

    const day = (offset) =>
        moment.tz(today, 'UTC').add(offset, 'days').format('YYYY-MM-DD');
    const requested = () =>
        emit.mock.calls.filter(([, event]) => event === 'proposal.requested');

    beforeEach(async () => {
        user = await createTestUser({
            email: 'morning@example.com',
            timezone: 'UTC',
        });
        today = moment.tz('UTC').format('YYYY-MM-DD');
        run = toolsFor(user);
        emit = jest.spyOn(dispatcher, 'emit').mockResolvedValue([]);
        jest.spyOn(registry, 'listensTo').mockImplementation(
            (name) => name === 'proposal.requested'
        );

        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
        const key = await agent
            .post('/api/profile/api-keys')
            .send({ name: 'Agent' });
        apiKey = key.body.token;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('registers morning_replan in taskScheduler every 15 minutes', () => {
        expect(taskScheduler._getCronExpression('morning_replan')).toBe(
            '*/15 * * * *'
        );
    });

    it('creates one morning week proposal when overdue tasks exist and does not create a second one', async () => {
        await run('create_task', {
            name: 'Overdue task',
            due_date: day(-1),
        });

        const dueNow = moment
            .tz(`${today} 06:35`, 'YYYY-MM-DD HH:mm', 'UTC')
            .toDate();

        await runMorningReplan(dueNow);

        const proposalsAfterFirst = await Proposal.findAll({
            where: { user_id: user.id, kind: 'week' },
        });
        expect(proposalsAfterFirst).toHaveLength(1);
        expect(proposalsAfterFirst[0].facts.trigger).toBe('morning');
        expect(proposalsAfterFirst[0].facts.last_morning_run).toBe(today);
        expect(requested()).toHaveLength(1);

        // Second run on the same day must not create another proposal.
        await runMorningReplan(dueNow);

        const proposalsAfterSecond = await Proposal.findAll({
            where: { user_id: user.id, kind: 'week' },
        });
        expect(proposalsAfterSecond).toHaveLength(1);
        expect(requested()).toHaveLength(1);

        // Answering the morning proposal notifies with the overdue replacement title.
        const answerRes = await request(app)
            .post(`/api/proposals/${proposalsAfterFirst[0].uid}/answer`)
            .set('Authorization', `Bearer ${apiKey}`)
            .send({
                answer: {
                    headline: '1 retard replacé aujourd’hui',
                    questions: [],
                    changes: [],
                },
            });
        expect(answerRes.status).toBe(200);

        const notification = await Notification.findOne({
            where: { user_id: user.id, type: 'proposal' },
            order: [['id', 'DESC']],
        });
        expect(notification).not.toBeNull();
        expect(notification.title).toBe('1 retard replacé, à valider');
    });

    it('skips users with no overdue tasks', async () => {
        await run('create_task', {
            name: 'Future task',
            due_date: day(2),
        });

        const dueNow = moment
            .tz(`${today} 06:35`, 'YYYY-MM-DD HH:mm', 'UTC')
            .toDate();

        await runMorningReplan(dueNow);

        const proposals = await Proposal.findAll({
            where: { user_id: user.id, kind: 'week' },
        });
        expect(proposals).toHaveLength(0);
    });

    it('saves and sanitizes ui_settings.planning.morningReplan without clobbering existing planning keys', async () => {
        await user.update({
            ui_settings: {
                planning: {
                    candidateOrder: ['overdue', 'due_today'],
                },
            },
        });

        const res = await agent.put('/api/profile/ui-settings').send({
            planning: {
                morningReplan: { enabled: false, time: '07:15' },
                unknownKey: 'ignored',
            },
        });
        expect(res.status).toBe(200);
        expect(res.body.ui_settings.planning).toEqual({
            candidateOrder: ['overdue', 'due_today'],
            morningReplan: { enabled: false, time: '07:15' },
        });

        const reloaded = await User.findByPk(user.id);
        expect(reloaded.ui_settings.planning).toEqual({
            candidateOrder: ['overdue', 'due_today'],
            morningReplan: { enabled: false, time: '07:15' },
        });
    });
});

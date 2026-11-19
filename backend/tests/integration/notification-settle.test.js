const request = require('supertest');
const app = require('../../app');
const {
    Notification,
    MailItem,
    AgentDecision,
    Proposal,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// A notification whose work is done, here or on another client, is no longer
// waiting: it reads as read, so the bell and the phone's screen drop it.
describe('agent notifications settle once their work is done', () => {
    let user, agent;

    const notify = (type, data, title = type) =>
        Notification.createNotification({
            userId: user.id,
            type,
            title,
            sources: [],
            data,
        });

    const mail = (status) =>
        MailItem.create({
            user_id: user.id,
            account: 'a',
            thread_id: `t${Math.random()}`,
            received_at: new Date(),
            summary: 's',
            gmail_url: 'https://mail.example.com/x',
            status,
        });

    const decision = (status) =>
        AgentDecision.create({
            user_id: user.id,
            kind: 'k',
            kind_label: 'K',
            key: `d${Math.random()}`,
            title: 't',
            choices: [],
            status,
        });

    const unreadTitles = async () => {
        const res = await agent.get(
            '/api/notifications?scope=agents&includeRead=false&limit=50'
        );
        return res.body.notifications.map((n) => n.title).sort();
    };

    beforeEach(async () => {
        user = await createTestUser({
            email: `settle_${Date.now()}@example.com`,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: user.email,
            password: 'password123',
        });
    });

    it('reads the mail and decision notices once nothing waits', async () => {
        await mail('done');
        await mail('later');
        await decision('done');
        await notify('mail_ready', { kind: 'mail_ready', count: 2 }, 'mail');
        await notify('decisions_ready', { count: 1 }, 'decision');

        expect(await unreadTitles()).toEqual([]);
        const count = await agent.get(
            '/api/notifications/unread-count?scope=agents'
        );
        expect(count.body.count).toBe(0);
    });

    it('keeps them while a card still waits', async () => {
        await mail('pending');
        await decision('pending');
        await notify('mail_ready', { kind: 'mail_ready', count: 1 }, 'mail');
        await notify('decisions_ready', { count: 1 }, 'decision');

        expect(await unreadTitles()).toEqual(['decision', 'mail']);
    });

    it('reads a proposal notice once the proposal is applied or replaced', async () => {
        const applied = await Proposal.create({
            user_id: user.id,
            kind: 'week',
            status: 'applied',
            facts: {},
        });
        const replaced = await Proposal.create({
            user_id: user.id,
            kind: 'week',
            status: 'dismissed',
            facts: {},
        });
        const open = await Proposal.create({
            user_id: user.id,
            kind: 'week',
            status: 'ready',
            facts: {},
        });
        await notify('proposal', { proposal_uid: applied.uid }, 'applied');
        await notify('proposal', { proposal_uid: replaced.uid }, 'replaced');
        await notify('proposal', { proposal_uid: open.uid }, 'open');
        await notify('system', { pluginId: 'hermes' }, 'plugin');

        expect(await unreadTitles()).toEqual(['open', 'plugin']);
    });
});

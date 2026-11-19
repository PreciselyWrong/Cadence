const request = require('supertest');
const app = require('../../app');
const { Notification, MailItem } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

// The bell and the phone's Notifications screen show only what an agent
// asks of the user; habit and task reminders already ring on the device.
describe('GET /api/notifications?scope=agents', () => {
    let user, agent;

    const create = (type, data, title = type) =>
        Notification.createNotification({
            userId: user.id,
            type,
            title,
            message: 'm',
            sources: [],
            data,
        });

    beforeEach(async () => {
        user = await createTestUser({
            email: `agents_${Date.now()}@example.com`,
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: user.email,
            password: 'password123',
        });

        await create('reminder', { habitUid: 'h1' }, 'habit');
        await create('reminder', { taskUid: 't1' }, 'task');
        await create('task_due_soon', { taskUid: 't1' }, 'due');
        await create('system', null, 'test');
        await MailItem.create({
            user_id: user.id,
            account: 'a',
            thread_id: 't1',
            received_at: new Date(),
            summary: 's',
            gmail_url: 'https://mail.example.com/x',
            status: 'pending',
        });
        await create('mail_ready', { kind: 'mail_ready', count: 3 }, 'mail');
        await create(
            'proposal',
            { proposal_uid: 'p1', kind: 'week' },
            'proposal'
        );
        await create(
            'system',
            { pluginId: 'hermes', agentLabel: 'Herald' },
            'plugin'
        );
    });

    it('lists only agent notifications, newest first', async () => {
        const res = await agent.get('/api/notifications?scope=agents&limit=2');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(3);
        expect(res.body.notifications.map((n) => n.title)).toEqual([
            'plugin',
            'proposal',
        ]);
    });

    it('counts only unread agent notifications', async () => {
        const res = await agent.get(
            '/api/notifications/unread-count?scope=agents'
        );
        expect(res.body.count).toBe(3);
        const all = await agent.get('/api/notifications/unread-count');
        expect(all.body.count).toBe(7);
    });

    it('keeps every notification without the scope', async () => {
        const res = await agent.get('/api/notifications?limit=50');
        expect(res.body.total).toBe(7);
    });
});

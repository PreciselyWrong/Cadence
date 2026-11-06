'use strict';

const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

const PATH = '/api/notifications/timed-tasks';

describe('timed task reminder setting', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'timed-setting@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'timed-setting@example.com',
            password: 'password123',
        });
    });

    it('defaults to ringing at the due time', async () => {
        const res = await agent.get(PATH);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: true, lead_minutes: 0 });
    });

    it('saves and returns the setting', async () => {
        const body = { enabled: false, lead_minutes: 15 };
        expect((await agent.put(PATH).send(body)).body).toEqual(body);
        expect((await agent.get(PATH)).body).toEqual(body);
    });

    it.each([
        [{ enabled: true, lead_minutes: 7 }],
        [{ enabled: 'yes', lead_minutes: 5 }],
        [{ lead_minutes: 5 }],
    ])('refuses %j', async (body) => {
        expect((await agent.put(PATH).send(body)).status).toBe(400);
    });

    it('survives a profile save that does not know about it', async () => {
        const body = { enabled: true, lead_minutes: 30 };
        await agent.put(PATH).send(body);

        await agent.patch('/api/profile').send({ ui_settings: { theme: 'x' } });

        expect((await agent.get(PATH)).body).toEqual(body);
    });

    it('requires a session', async () => {
        expect((await request(app).get(PATH)).status).toBe(401);
    });
});

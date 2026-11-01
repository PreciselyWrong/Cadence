const request = require('supertest');
const app = require('../../app');
const { User } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Quiet hours profile field', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({
            email: `quiet_${Date.now()}@example.com`,
        });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    it('is null by default', async () => {
        const response = await agent.get('/api/profile');
        expect(response.status).toBe(200);
        expect(response.body.quiet_hours).toBeNull();
    });

    it('saves and returns the window', async () => {
        const quiet = { enabled: true, start: '22:00', end: '07:00' };
        const response = await agent
            .patch('/api/profile')
            .send({ quiet_hours: quiet });

        expect(response.status).toBe(200);
        expect(response.body.quiet_hours).toEqual(quiet);
        expect((await User.findByPk(user.id)).quiet_hours).toEqual(quiet);
    });

    it('clears the window with null', async () => {
        await agent.patch('/api/profile').send({
            quiet_hours: { enabled: true, start: '22:00', end: '07:00' },
        });
        const response = await agent
            .patch('/api/profile')
            .send({ quiet_hours: null });

        expect(response.status).toBe(200);
        expect(response.body.quiet_hours).toBeNull();
    });

    it('rejects a malformed window', async () => {
        const response = await agent.patch('/api/profile').send({
            quiet_hours: { enabled: true, start: '25:00', end: '07:00' },
        });

        expect(response.status).toBe(400);
        expect((await User.findByPk(user.id)).quiet_hours).toBeNull();
    });
});

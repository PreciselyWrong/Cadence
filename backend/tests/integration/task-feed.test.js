const request = require('supertest');
const ICAL = require('ical.js');
const app = require('../../app');
const { Task, User } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Task feed (.ics)', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'feed@example.com' });
        await User.update(
            { timezone: 'Europe/Zurich' },
            { where: { id: user.id } }
        );
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'feed@example.com',
            password: 'password123',
        });
    });

    const inDays = (days, hours = 12) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + days);
        d.setUTCHours(hours, 0, 0, 0);
        return d;
    };

    const events = (text) =>
        new ICAL.Component(ICAL.parse(text))
            .getAllSubcomponents('vevent')
            .map((e) => new ICAL.Event(e));

    it('is off until an address is made', async () => {
        const res = await agent.get('/api/profile/task-feed');
        expect(res.body).toEqual({ enabled: false });
    });

    it('serves open dated tasks at the secret address', async () => {
        await Task.create({
            user_id: user.id,
            name: 'Timed',
            status: 0,
            due_date: inDays(3, 9),
            due_has_time: true,
            estimated_minutes: 90,
        });
        await Task.create({
            user_id: user.id,
            name: 'Whole day',
            status: 0,
            due_date: inDays(5, 21),
            start_date: inDays(3, 0),
        });
        await Task.create({
            user_id: user.id,
            name: 'Done',
            status: 2,
            due_date: inDays(2),
        });
        await Task.create({ user_id: user.id, name: 'Undated', status: 0 });

        const made = await agent.post('/api/profile/task-feed');
        expect(made.body.enabled).toBe(true);
        expect(made.body.path).toMatch(/^\/feeds\/tasks\/tf_[\w-]+\.ics$/);

        const feed = await request(app).get(`/api${made.body.path}`);
        expect(feed.status).toBe(200);
        expect(feed.headers['content-type']).toMatch(/text\/calendar/);

        const byName = Object.fromEntries(
            events(feed.text).map((e) => [e.summary, e])
        );
        expect(Object.keys(byName).sort()).toEqual(['Timed', 'Whole day']);
        expect(byName.Timed.duration.toSeconds()).toBe(90 * 60);
        expect(byName['Whole day'].startDate.isDate).toBe(true);
        expect(byName['Whole day'].duration.toSeconds()).toBe(3 * 86400);
    });

    it('stops serving an address once replaced or turned off', async () => {
        const first = await agent.post('/api/profile/task-feed');
        const second = await agent.post('/api/profile/task-feed');
        expect((await request(app).get(`/api${first.body.path}`)).status).toBe(
            404
        );
        expect((await request(app).get(`/api${second.body.path}`)).status).toBe(
            200
        );

        await agent.delete('/api/profile/task-feed');
        expect((await request(app).get(`/api${second.body.path}`)).status).toBe(
            404
        );
        expect((await agent.get('/api/profile/task-feed')).body).toEqual({
            enabled: false,
        });
    });

    it('rejects a made-up token', async () => {
        const res = await request(app).get('/api/feeds/tasks/tf_nope.ics');
        expect(res.status).toBe(404);
    });
});

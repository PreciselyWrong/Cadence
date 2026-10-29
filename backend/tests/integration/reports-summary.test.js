'use strict';

const request = require('supertest');
const app = require('../../app');
const { Task, Project, Tag, Permission } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('GET /api/reports/summary', () => {
    let agent;
    let user;

    beforeEach(async () => {
        user = await createTestUser({
            email: 'summary@example.com',
            timezone: 'America/New_York',
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'summary@example.com',
            password: 'password123',
        });
    });

    const done = (name, completedAt, extra = {}) =>
        Task.create({
            name,
            user_id: user.id,
            status: Task.STATUS.DONE,
            completed_at: new Date(completedAt),
            ...extra,
        });

    it('requires authentication', async () => {
        const res = await request(app).get(
            '/api/reports/summary?start=2026-02-01&end=2026-02-02'
        );
        expect(res.status).toBe(401);
    });

    it('rejects bad and too long ranges', async () => {
        let res = await agent.get('/api/reports/summary?start=foo&end=bar');
        expect(res.status).toBe(400);
        res = await agent.get(
            '/api/reports/summary?start=2026-02-05&end=2026-02-01'
        );
        expect(res.status).toBe(400);
        res = await agent.get(
            '/api/reports/summary?start=2025-01-01&end=2026-01-02'
        );
        expect(res.status).toBe(400);
        res = await agent.get(
            '/api/reports/summary?start=2025-01-01&end=2026-01-01'
        );
        expect(res.status).toBe(200);
    });

    it('uses day boundaries in the user timezone', async () => {
        // New York is UTC-5 in February 2026.
        await done('just before', '2026-02-10T04:59:00Z'); // Feb 9, 23:59 NY
        await done('first minute', '2026-02-10T05:00:00Z'); // Feb 10, 00:00 NY
        await done('last minute', '2026-02-11T04:59:00Z'); // Feb 10, 23:59 NY
        await done('just after', '2026-02-11T05:00:00Z'); // Feb 11, 00:00 NY

        const res = await agent.get(
            '/api/reports/summary?start=2026-02-10&end=2026-02-10'
        );
        expect(res.status).toBe(200);
        expect(res.body.timezone).toBe('America/New_York');
        expect(res.body.tasks.map((t) => t.name)).toEqual([
            'first minute',
            'last minute',
        ]);
        expect(res.body.tasks[1].completed_date).toBe('2026-02-10');
    });

    it('returns project, tags and status, and open tasks only when asked', async () => {
        const project = await Project.create({
            name: 'Launch',
            user_id: user.id,
        });
        const tag = await Tag.create({ name: 'work', user_id: user.id });
        const t = await done('ship it', '2026-02-10T15:00:00Z', {
            project_id: project.id,
        });
        await t.addTag(tag);
        await Task.create({
            name: 'still open',
            user_id: user.id,
            status: Task.STATUS.NOT_STARTED,
            due_date: new Date('2026-02-11T04:59:59Z'),
        });
        await Task.create({
            name: 'cancelled',
            user_id: user.id,
            status: Task.STATUS.CANCELLED,
            due_date: new Date('2026-02-11T04:59:59Z'),
        });

        let res = await agent.get(
            '/api/reports/summary?start=2026-02-10&end=2026-02-10'
        );
        expect(res.body.tasks).toHaveLength(1);
        expect(res.body.tasks[0]).toMatchObject({
            name: 'ship it',
            status: 'done',
            project: { name: 'Launch' },
            tags: ['work'],
        });

        res = await agent.get(
            '/api/reports/summary?start=2026-02-10&end=2026-02-10&include_open=true'
        );
        expect(res.body.tasks.map((x) => x.name).sort()).toEqual([
            'ship it',
            'still open',
        ]);
        expect(res.body.open_count).toBe(1);
        const open = res.body.tasks.find((x) => x.name === 'still open');
        expect(open.due_date).toBe('2026-02-10');
        expect(open.status).toBe('not_started');
    });

    it('includes tasks from shared projects but not other users tasks', async () => {
        const other = await createTestUser({ email: 'other@example.com' });
        const shared = await Project.create({
            name: 'Shared',
            user_id: other.id,
        });
        await Permission.create({
            user_id: user.id,
            resource_type: 'project',
            resource_uid: shared.uid,
            access_level: 'rw',
            propagation: 'direct',
            granted_by_user_id: other.id,
        });
        await Task.create({
            name: 'shared done',
            user_id: other.id,
            project_id: shared.id,
            status: Task.STATUS.DONE,
            completed_at: new Date('2026-02-10T15:00:00Z'),
        });
        await Task.create({
            name: 'private done',
            user_id: other.id,
            status: Task.STATUS.DONE,
            completed_at: new Date('2026-02-10T15:00:00Z'),
        });

        const res = await agent.get(
            '/api/reports/summary?start=2026-02-10&end=2026-02-10'
        );
        expect(res.body.tasks.map((t) => t.name)).toEqual(['shared done']);
    });
});

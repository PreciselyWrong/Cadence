'use strict';

// A link with a review day comes back in « À trier » on that day.
const request = require('supertest');
const app = require('../../app');
const { Link } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('triage › links to review', () => {
    let user;
    let agent;

    const link = (fields) =>
        Link.create({ user_id: user.id, status: 'new', ...fields });
    const reviewItems = async () =>
        (await agent.get('/api/triage')).body.items.filter(
            (item) => item.type === 'link_review'
        );

    beforeEach(async () => {
        user = await createTestUser({ email: 'linkreview@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: user.email, password: 'password123' });
    });

    it('lists the links whose review day has come, not the others', async () => {
        const due = await link({
            url: 'https://example.com/a',
            title: 'A',
            review_at: '2020-01-01',
        });
        await link({ url: 'https://example.com/b', review_at: '2099-01-01' });
        await link({ url: 'https://example.com/c' });
        await link({
            url: 'https://example.com/d',
            status: 'dropped',
            review_at: '2020-01-01',
        });

        const items = await reviewItems();
        expect(items).toHaveLength(1);
        expect(items[0].payload).toMatchObject({
            link_uid: due.uid,
            title: 'A',
            url: 'https://example.com/a',
        });
    });

    it('keeps, archives or postpones a link to review', async () => {
        const keep = await link({
            url: 'https://example.com/k',
            review_at: '2020-01-01',
        });
        const drop = await link({
            url: 'https://example.com/x',
            review_at: '2020-01-01',
        });
        const later = await link({
            url: 'https://example.com/l',
            review_at: '2020-01-01',
        });
        const decide = (uid, decision) =>
            agent.post(`/api/triage/links/${uid}/review`).send({ decision });

        expect((await decide(keep.uid, 'keep')).status).toBe(200);
        await decide(drop.uid, 'archive');
        await decide(later.uid, 'later');
        expect((await decide(later.uid, 'nope')).status).toBe(400);

        await keep.reload();
        await drop.reload();
        await later.reload();
        expect(keep.review_at).toBeNull();
        expect(drop.status).toBe('dropped');
        expect(String(later.review_at) > '2026-01-01').toBe(true);
        expect(await reviewItems()).toEqual([]);
    });
});

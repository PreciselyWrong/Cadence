const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');
const favicons = require('../../modules/links/favicons');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

// The icon of a site, read by the server and kept by host, for the origin
// badge of a task (docs/00-tasks-behavior.md, Origin badge).
describe('Link favicons', () => {
    let agent;
    let fetched;

    beforeEach(async () => {
        fetched = [];
        favicons.configure({
            fetcher: async (url) => {
                fetched.push(url);
                if (url === 'https://mail.google.com/favicon.ico') {
                    return { status: 200, type: 'image/x-icon', body: PNG };
                }
                if (url === 'https://blog.example.com/favicon.ico') {
                    return { status: 404, type: 'text/html', body: null };
                }
                if (url === 'https://blog.example.com/') {
                    return {
                        status: 200,
                        type: 'text/html; charset=utf-8',
                        body: Buffer.from(
                            '<html><head><link rel="shortcut icon" href="/static/i.png"></head>'
                        ),
                    };
                }
                if (url === 'https://blog.example.com/static/i.png') {
                    return { status: 200, type: 'image/png', body: PNG };
                }
                if (url === 'https://svg.example.com/favicon.ico') {
                    return {
                        status: 200,
                        type: 'image/svg+xml',
                        body: Buffer.from('<svg onload="alert(1)"/>'),
                    };
                }
                return { status: 404, type: 'text/html', body: null };
            },
        });
        favicons.clear();
        await createTestUser({ email: 'favicons@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'favicons@example.com', password: 'password123' });
    });

    afterEach(() => favicons.configure({ fetcher: null }));

    const icon = (host) => agent.get('/api/links/favicon').query({ host });

    it('answers the site icon, read once per host', async () => {
        const first = await icon('mail.google.com');
        expect(first.status).toBe(200);
        expect(first.headers['content-type']).toBe('image/x-icon');
        expect(first.headers['x-content-type-options']).toBe('nosniff');
        expect(first.headers['cache-control']).toMatch(/max-age=\d+/);
        expect(Buffer.from(first.body)).toEqual(PNG);

        await icon('MAIL.google.com');
        expect(fetched).toEqual(['https://mail.google.com/favicon.ico']);
    });

    it('falls back to the icon the home page names', async () => {
        const res = await icon('blog.example.com');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(fetched).toContain('https://blog.example.com/static/i.png');
    });

    it('refuses svg, unknown icons and anything that is not a host', async () => {
        expect((await icon('svg.example.com')).status).toBe(404);
        expect((await icon('nothing.example.com')).status).toBe(404);
        expect((await icon('evil.com/path')).status).toBe(400);
        expect((await icon('')).status).toBe(400);
        expect((await icon('localhost')).status).toBe(400);
    });

    it('needs a signed-in user', async () => {
        const res = await request(app)
            .get('/api/links/favicon')
            .query({ host: 'mail.google.com' });
        expect(res.status).toBe(401);
    });
});

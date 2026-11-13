const request = require('supertest');
const app = require('../../app');
const { LinkPreview } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const previews = require('../../modules/links/previews');

// Previews of addresses, read once by the server and kept by address for
// tasks, notes and project pages (docs/37-links.md, Previews).
describe('Link previews', () => {
    let agent;
    let fetched;

    beforeEach(async () => {
        fetched = [];
        previews.configure({
            fetcher: async (url) => {
                fetched.push(url);
                if (url.includes('broken')) return null;
                const repo = url.includes('github.com');
                return {
                    title: repo ? 'rocket' : 'A page',
                    description: 'About it',
                    image_url: 'https://img.example.com/a.png',
                    site_name: repo ? 'GitHub' : 'Example',
                    kind: repo ? 'repo' : 'article',
                    github_stars: repo ? 1234 : null,
                    github_language: repo ? 'Rust' : null,
                    github_last_commit: repo
                        ? new Date('2026-11-01T10:00:00Z')
                        : null,
                    readme_excerpt: null,
                };
            },
        });
        await createTestUser({ email: 'previews@example.com' });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'previews@example.com', password: 'password123' });
    });

    afterEach(() => previews.configure({ fetcher: null }));

    const preview = (url) => agent.get('/api/url/title').query({ url });

    it('answers what the page is, with GitHub stats, read once per address', async () => {
        const first = await preview('https://github.com/acme/rocket');
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            url: 'https://github.com/acme/rocket',
            title: 'rocket',
            description: 'About it',
            image: 'https://img.example.com/a.png',
            site_name: 'GitHub',
            kind: 'repo',
            github_stars: 1234,
            github_language: 'Rust',
            github_last_commit: '2026-11-01T10:00:00.000Z',
        });

        const again = await preview(
            'https://www.github.com/acme/rocket/?utm_source=share#readme'
        );
        expect(again.body.title).toBe('rocket');
        expect(fetched).toEqual(['https://github.com/acme/rocket']);
        expect(await LinkPreview.count()).toBe(1);
    });

    it('gives a video read without its picture the one YouTube serves', async () => {
        await LinkPreview.create({
            url: previews.addressOf(
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            ),
            kind: 'video',
            title: 'A song',
            fetch_status: 'done',
            fetched_at: new Date(),
        });
        const answer = await preview(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        );
        expect(answer.body.image).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        );
        expect(fetched).toEqual([]);
    });

    it('keeps a failed read for a while, then tries again', async () => {
        const failed = await preview('https://broken.example.com/x');
        expect(failed.body).toMatchObject({
            title: null,
            error: 'Could not extract metadata',
        });
        await preview('https://broken.example.com/x');
        expect(fetched).toHaveLength(1);

        await LinkPreview.update(
            { fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000) },
            { where: {} }
        );
        await preview('https://broken.example.com/x');
        expect(fetched).toHaveLength(2);
    });

    it('reads a page again after 30 days, keeping what it had when the new read fails', async () => {
        await preview('https://example.com/a');
        await LinkPreview.update(
            {
                fetched_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
            },
            { where: {} }
        );
        previews.configure({
            fetcher: async (url) => {
                fetched.push(url);
                return null;
            },
        });
        const stale = await preview('https://example.com/a');
        expect(fetched).toHaveLength(2);
        expect(stale.body.title).toBe('A page');
    });

    it('never reads an address that is not a public web page', async () => {
        const res = await preview('http://192.168.1.10/admin');
        expect(res.body.title).toBeNull();
        expect(fetched).toHaveLength(0);
    });
});

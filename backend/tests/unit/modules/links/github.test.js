const {
    fetchRepo,
    readmeExcerpt,
    GithubRateLimited,
} = require('../../../../modules/links/core/github');

const json = (body, status = 200, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

describe('links/core/github', () => {
    describe('readmeExcerpt', () => {
        it('drops badges, images, html and headings, keeps link text', () => {
            const md = [
                '# Tool',
                '[![CI](https://x/badge.svg)](https://x) ![logo](logo.png)',
                '<p align="center"><img src="a.png"></p>',
                'A **fast** [CLI](https://cli.io) for `json`.',
                '```sh',
                'npm i tool',
                '```',
                'Second paragraph.',
            ].join('\n');
            expect(readmeExcerpt(md)).toBe(
                'Tool A fast CLI for json. Second paragraph.'
            );
        });

        it('cuts at a word boundary with an ellipsis', () => {
            const text = 'word '.repeat(200);
            const out = readmeExcerpt(text, 400);
            expect(out.length).toBeLessThanOrEqual(401);
            expect(out.endsWith('…')).toBe(true);
            expect(out).not.toMatch(/wor…$/);
        });
    });

    describe('fetchRepo', () => {
        it('reads stars, language, last push and the README start', async () => {
            const calls = [];
            const fakeFetch = async (url, options) => {
                calls.push({ url, accept: options.headers.Accept });
                if (url.endsWith('/readme')) return json('# Hello\nWorld');
                return json({
                    stargazers_count: 1234,
                    language: 'Rust',
                    pushed_at: '2026-10-30T10:00:00Z',
                    description: 'A tool',
                    full_name: 'o/r',
                });
            };

            const repo = await fetchRepo(
                { owner: 'o', repo: 'r' },
                { fetchFn: fakeFetch }
            );

            expect(repo).toEqual({
                stars: 1234,
                language: 'Rust',
                last_commit: '2026-10-30T10:00:00Z',
                description: 'A tool',
                name: 'o/r',
                readme_excerpt: 'Hello World',
            });
            expect(calls[0].url).toBe('https://api.github.com/repos/o/r');
            expect(calls[1].accept).toBe('application/vnd.github.raw');
        });

        it('returns null for a missing repository', async () => {
            const repo = await fetchRepo(
                { owner: 'o', repo: 'gone' },
                { fetchFn: async () => json({}, 404) }
            );
            expect(repo).toBeNull();
        });

        it('keeps the repo when the README is missing', async () => {
            const fakeFetch = async (url) =>
                url.endsWith('/readme')
                    ? json({}, 404)
                    : json({ stargazers_count: 1, full_name: 'o/r' });
            const repo = await fetchRepo(
                { owner: 'o', repo: 'r' },
                { fetchFn: fakeFetch }
            );
            expect(repo.stars).toBe(1);
            expect(repo.readme_excerpt).toBeNull();
        });

        it('signals the rate limit with its reset time', async () => {
            const fakeFetch = async () =>
                json({}, 403, {
                    'x-ratelimit-remaining': '0',
                    'x-ratelimit-reset': '1800000000',
                });
            await expect(
                fetchRepo({ owner: 'o', repo: 'r' }, { fetchFn: fakeFetch })
            ).rejects.toEqual(
                expect.objectContaining({
                    name: 'GithubRateLimited',
                    resetAt: 1800000000 * 1000,
                })
            );
            expect(GithubRateLimited).toBeDefined();
        });
    });
});

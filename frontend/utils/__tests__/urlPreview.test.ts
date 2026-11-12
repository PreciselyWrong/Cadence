import { fetchUrlPreview } from '../urlService';

jest.mock('../authUtils', () => ({
    handleAuthResponse: jest.fn(),
    getPostHeadersWithCsrf: jest.fn(),
}));

const answer = (body: Record<string, unknown>) => {
    global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(body),
    }) as jest.Mock;
};

describe('fetchUrlPreview', () => {
    it('keeps the title, description and picture of the page', async () => {
        answer({
            url: 'https://a.io/x',
            title: ' Rust patterns ',
            description: 'A guide',
            image: 'https://a.io/i.png',
        });
        expect(await fetchUrlPreview('https://a.io/x')).toEqual({
            url: 'https://a.io/x',
            title: 'Rust patterns',
            description: 'A guide',
            image: 'https://a.io/i.png',
            siteName: null,
            kind: null,
            githubStars: null,
            githubLanguage: null,
            githubLastCommit: null,
        });
    });

    it('takes the host name the server falls back to as no title', async () => {
        answer({ url: 'https://www.b.io/y', title: 'b.io' });
        expect((await fetchUrlPreview('https://www.b.io/y')).title).toBeNull();
    });

    it('reads an address once', async () => {
        answer({ url: 'https://c.io', title: 'C' });
        await fetchUrlPreview('https://c.io');
        await fetchUrlPreview('https://c.io');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

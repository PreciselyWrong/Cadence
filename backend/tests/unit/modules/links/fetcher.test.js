const { fetchLinkMetadata } = require('../../../../modules/links/fetcher');
const { youtubeThumbnail } = require('../../../../modules/links/core/urls');

// A video's picture beside its task (docs/37-links.md, Rows).
describe('YouTube pictures', () => {
    it('derives the picture of a video from its address', () => {
        expect(
            youtubeThumbnail('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4')
        ).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        expect(youtubeThumbnail('https://youtu.be/dQw4w9WgXcQ')).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        );
        expect(
            youtubeThumbnail('https://m.youtube.com/shorts/dQw4w9WgXcQ')
        ).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        expect(youtubeThumbnail('https://www.youtube.com/')).toBeNull();
        expect(youtubeThumbnail('https://example.com/watch?v=x')).toBeNull();
    });

    it('gives a video its picture when the page names none', async () => {
        const meta = await fetchLinkMetadata(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            { fetchPage: async () => ({ title: 'www.youtube.com' }) }
        );
        expect(meta.image_url).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        );
    });

    it('keeps the picture a page names', async () => {
        const meta = await fetchLinkMetadata('https://youtu.be/dQw4w9WgXcQ', {
            fetchPage: async () => ({
                title: 'A song',
                image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
            }),
        });
        expect(meta.image_url).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
        );
    });
});

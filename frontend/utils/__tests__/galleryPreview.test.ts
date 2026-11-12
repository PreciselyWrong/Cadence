import { firstImageIn, plainExcerpt } from '../galleryPreview';

describe('firstImageIn', () => {
    it('finds a Markdown image', () => {
        expect(
            firstImageIn(
                'Intro\n\n![Cover](https://img.example.com/a.png "Title") more'
            )
        ).toBe('https://img.example.com/a.png');
    });

    it('finds an HTML image', () => {
        expect(
            firstImageIn('<p><img alt="x" src="https://x.test/b.jpg"></p>')
        ).toBe('https://x.test/b.jpg');
    });

    it('accepts an attachment path on this server', () => {
        expect(firstImageIn('![](/api/attachments/abc/file.png)')).toBe(
            '/api/attachments/abc/file.png'
        );
    });

    it('ignores scripts, data and other schemes', () => {
        expect(
            firstImageIn(
                '![x](javascript:alert(1)) ![y](data:image/png;base64,AA)'
            )
        ).toBeNull();
        expect(firstImageIn('![x](//evil.test/a.png)')).toBeNull();
    });

    it('returns null without an image', () => {
        expect(firstImageIn('Just [a link](https://a.test) here')).toBeNull();
        expect(firstImageIn(null)).toBeNull();
    });
});

describe('plainExcerpt', () => {
    it('drops Markdown marks, images and link targets', () => {
        expect(
            plainExcerpt(
                '# Title\n\n**Bold** and [a link](https://a.test).\n\n![img](https://i.test/x.png)\n- item'
            )
        ).toBe('Title Bold and a link. item');
    });

    it('cuts long text at the limit with an ellipsis', () => {
        const text = 'word '.repeat(100);
        const excerpt = plainExcerpt(text, 40);
        expect(excerpt.length).toBeLessThanOrEqual(41);
        expect(excerpt.endsWith('…')).toBe(true);
    });

    it('shows a checked task link as its plain name', () => {
        expect(plainExcerpt('- [x] [[task:Call hotel]]')).toBe('Call hotel');
    });
});

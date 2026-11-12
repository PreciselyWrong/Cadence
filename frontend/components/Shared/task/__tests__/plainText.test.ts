import { plainPreview, plainText } from '../plainText';

describe('plainPreview', () => {
    it('keeps the text of the first line without Markdown marks', () => {
        expect(plainPreview('## **Call** the _bank_ `now`\nmore')).toBe(
            'Call the bank now'
        );
    });

    it('keeps link, wiki link and mention text', () => {
        expect(
            plainPreview(
                'See [the doc](https://x.y) and [[task:Pay rent]] with @[Ana](person:u1)'
            )
        ).toBe('See the doc and Pay rent with @Ana');
    });

    it('drops bullets, checkboxes, quotes, images and tags', () => {
        expect(plainPreview('- [ ] buy milk')).toBe('buy milk');
        expect(plainPreview('> 1. quoted')).toBe('quoted');
        expect(plainPreview('![img](a.png)\n<b>Bold</b> text')).toBe(
            'Bold text'
        );
    });

    it('skips blank, fence and rule lines and handles empty input', () => {
        expect(plainPreview('\n```\n---\nReal line')).toBe('Real line');
        expect(plainPreview('')).toBe('');
        expect(plainPreview(null)).toBe('');
    });

    it('shows a checked task line as its plain name', () => {
        expect(plainPreview('- [x] [[task:Call hotel]]')).toBe('Call hotel');
    });

    it('joins every line into the whole plain text', () => {
        expect(plainText('# Head\n| a | b |\n- [[Note]] tail')).toBe(
            'Head Note tail'
        );
    });
});

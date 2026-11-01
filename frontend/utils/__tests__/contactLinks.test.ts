import {
    findContactLinks,
    remarkContactLinks,
    contactUrlTransform,
} from '../contactLinks';

describe('findContactLinks', () => {
    it.each([
        ['+41 79 123 45 67', 'tel:+41791234567'],
        ['079 123 45 67', 'tel:0791234567'],
        ['+33 6 12 34 56 78', 'tel:+33612345678'],
        ['(+41) 79-123.45.67', 'tel:+41791234567'],
    ])('links the phone number in %s', (text, href) => {
        const [match] = findContactLinks(text);
        expect(match).toMatchObject({ kind: 'tel', href });
        expect(text.slice(match.start, match.end)).toBe(match.text);
    });

    it('links an email address', () => {
        const [match] = findContactLinks('write to ana.b+x@example.ch today');
        expect(match).toMatchObject({
            kind: 'mailto',
            text: 'ana.b+x@example.ch',
            href: 'mailto:ana.b+x@example.ch',
        });
    });

    it.each([
        ['dates', 'due 2026-11-01 or 01.11.2026'],
        ['times', 'meet at 14:30 or 09:00-10:15'],
        ['years and counts', 'in 2026 we sold 1234567 units'],
        ['plain words', 'nothing to link here'],
    ])('does not link %s', (_label, text) => {
        expect(findContactLinks(text)).toEqual([]);
    });

    it('returns every match in order', () => {
        const matches = findContactLinks('a@b.ch or 079 123 45 67');
        expect(matches.map((m) => m.kind)).toEqual(['mailto', 'tel']);
    });
});

describe('contactUrlTransform', () => {
    it('keeps tel links that react-markdown would strip', () => {
        expect(contactUrlTransform('tel:+41791234567')).toBe(
            'tel:+41791234567'
        );
    });

    it('still blocks javascript links', () => {
        expect(contactUrlTransform('javascript:alert(1)')).toBe('');
    });
});

describe('remarkContactLinks', () => {
    const run = (text: string) => {
        const tree: any = {
            type: 'root',
            children: [
                {
                    type: 'paragraph',
                    children: [{ type: 'text', value: text }],
                },
            ],
        };
        remarkContactLinks()(tree);
        return tree.children[0].children;
    };

    it('splits text around a phone number into a tel link', () => {
        const nodes = run('Call 079 123 45 67 please');
        expect(nodes).toEqual([
            { type: 'text', value: 'Call ' },
            {
                type: 'link',
                url: 'tel:0791234567',
                children: [{ type: 'text', value: '079 123 45 67' }],
            },
            { type: 'text', value: ' please' },
        ]);
    });

    it('leaves text inside an existing link alone', () => {
        const tree: any = {
            type: 'root',
            children: [
                {
                    type: 'link',
                    url: 'https://x.ch',
                    children: [{ type: 'text', value: 'a@b.ch' }],
                },
            ],
        };
        remarkContactLinks()(tree);
        expect(tree.children[0].children).toEqual([
            { type: 'text', value: 'a@b.ch' },
        ]);
    });
});

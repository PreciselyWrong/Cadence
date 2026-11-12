import { capturedTask, classifyKind, isOnlyAddress } from '../linkTaskName';

const verbs: Record<string, string> = {
    'links.taskVerb.try': 'Essayer : {{title}}',
    'links.taskVerb.read': 'Lire : {{title}}',
    'links.taskVerb.watch': 'Regarder : {{title}}',
};
const t = (key: string, title: string) =>
    (verbs[key] ?? key).replace('{{title}}', title);

// Same rule as backend/modules/links/core/taskName.js.
describe('linkTaskName', () => {
    it('reads the kind of page from its address', () => {
        expect(classifyKind('https://github.com/acme/rocket')).toBe('repo');
        expect(classifyKind('https://github.com/features/actions')).toBe(
            'other'
        );
        expect(classifyKind('https://www.youtube.com/watch?v=x')).toBe('video');
        expect(classifyKind('https://blog.medium.com/a')).toBe('article');
        expect(classifyKind('https://tool.example.com/')).toBe('tool');
        expect(classifyKind('https://example.com/a/b')).toBe('other');
        expect(classifyKind('https://example.com/a', 'article')).toBe(
            'article'
        );
    });

    it('names the task after the verb of the kind and the page title', () => {
        expect(
            capturedTask(
                { url: 'https://github.com/acme/rocket', title: 'Rocket' },
                t
            )
        ).toEqual({
            name: 'Essayer : acme/rocket',
            note: 'https://github.com/acme/rocket',
        });
        expect(
            capturedTask({ url: 'https://youtu.be/abc', title: 'Talk' }, t).name
        ).toBe('Regarder : Talk');
        expect(
            capturedTask(
                {
                    url: 'https://example.com/p',
                    title: 'Post',
                    kind: 'article',
                },
                t
            ).name
        ).toBe('Lire : Post');
        expect(
            capturedTask({ url: 'https://example.com/a/b', title: 'Page' }, t)
                .name
        ).toBe('Page');
    });

    it('names a repository by its path, whatever the page title', () => {
        expect(
            capturedTask(
                {
                    url: 'https://github.com/jqlang/jq',
                    title: 'GitHub - jqlang/jq: Command-line JSON processor',
                },
                t
            ).name
        ).toBe('Essayer : jqlang/jq');
    });

    it('falls back to the repository, then the site, and keeps the words in the note', () => {
        expect(
            capturedTask({ url: 'https://github.com/acme/rocket' }, t).name
        ).toBe('Essayer : acme/rocket');
        expect(
            capturedTask(
                { url: 'https://www.example.com/a/b', words: 'for later' },
                t
            )
        ).toEqual({
            name: 'example.com',
            note: 'https://www.example.com/a/b\n\nfor later',
        });
    });

    it('tells an idea that is only an address', () => {
        expect(isOnlyAddress('https://example.com/a')).toBe(true);
        expect(isOnlyAddress('  https://example.com/a  ')).toBe(true);
        expect(isOnlyAddress('read https://example.com/a')).toBe(false);
        expect(isOnlyAddress('no address')).toBe(false);
    });
});

const {
    taskVerbKey,
    taskNameFor,
    urlsIn,
} = require('../../../../modules/links/core/taskName');

const verbs = {
    'links.taskVerb.try': 'Essayer : {{title}}',
    'links.taskVerb.read': 'Lire : {{title}}',
    'links.taskVerb.watch': 'Regarder : {{title}}',
};
const translate = (key) => verbs[key] ?? null;

describe('links/core/taskName', () => {
    it('picks the verb from the kind of page', () => {
        expect(taskVerbKey('repo')).toBe('links.taskVerb.try');
        expect(taskVerbKey('tool')).toBe('links.taskVerb.try');
        expect(taskVerbKey('article')).toBe('links.taskVerb.read');
        expect(taskVerbKey('video')).toBe('links.taskVerb.watch');
        expect(taskVerbKey('other')).toBeNull();
        expect(taskVerbKey(undefined)).toBeNull();
    });

    it('names a repository « Essayer : … » after its title', () => {
        expect(
            taskNameFor(
                {
                    url: 'https://github.com/acme/rocket',
                    title: 'acme/rocket',
                },
                translate
            )
        ).toBe('Essayer : acme/rocket');
    });

    it('reads the kind from the address when none is given', () => {
        expect(
            taskNameFor(
                { url: 'https://youtu.be/abc', title: 'A talk' },
                translate
            )
        ).toBe('Regarder : A talk');
        expect(
            taskNameFor(
                {
                    url: 'https://example.com/post',
                    title: 'A post',
                    kind: 'article',
                },
                translate
            )
        ).toBe('Lire : A post');
    });

    it('keeps the title alone for any other page', () => {
        expect(
            taskNameFor(
                { url: 'https://example.com/a/b', title: 'Some page' },
                translate
            )
        ).toBe('Some page');
    });

    it('names a repository by its path, whatever the page title', () => {
        expect(
            taskNameFor(
                {
                    url: 'https://github.com/jqlang/jq',
                    title: 'GitHub - jqlang/jq: Command-line JSON processor',
                },
                translate
            )
        ).toBe('Essayer : jqlang/jq');
    });

    it('falls back to the repository, then the site, when the title is unknown', () => {
        expect(
            taskNameFor(
                { url: 'https://github.com/acme/rocket', title: '  ' },
                translate
            )
        ).toBe('Essayer : acme/rocket');
        expect(
            taskNameFor({ url: 'https://www.example.com/a/b' }, translate)
        ).toBe('example.com');
    });

    it('keeps the title alone when the language has no verb', () => {
        expect(
            taskNameFor(
                { url: 'https://github.com/acme/rocket', title: 'Rocket' },
                () => null
            )
        ).toBe('acme/rocket');
    });

    it('finds the web addresses of a text, without trailing punctuation', () => {
        expect(
            urlsIn(
                'See https://github.com/acme/rocket, and (https://example.com/a).\nhttp://x.org/b?c=1'
            )
        ).toEqual([
            'https://github.com/acme/rocket',
            'https://example.com/a',
            'http://x.org/b?c=1',
        ]);
        expect(urlsIn(null)).toEqual([]);
    });
});

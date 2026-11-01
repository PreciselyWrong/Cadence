import { Link } from '../../entities/Link';
import {
    DEFAULT_LINK_FILTER,
    domainsOf,
    filterLinks,
    firstUrl,
    linkForItem,
    residualText,
    sourcePath,
    tagsOf,
} from '../linkFilters';

const link = (overrides: Partial<Link>): Link => ({
    uid: 'u',
    url: 'https://example.com/a',
    domain: 'example.com',
    title: null,
    description: null,
    image_url: null,
    site_name: null,
    kind: 'other',
    github_stars: null,
    github_language: null,
    github_last_commit: null,
    readme_excerpt: null,
    note: null,
    status: 'new',
    tags: [],
    source_type: null,
    source_uid: null,
    fetch_status: 'done',
    fetched_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
});

const links = [
    link({
        uid: 'repo',
        url: 'https://github.com/a/b',
        domain: 'github.com',
        kind: 'repo',
        title: 'a/b',
        readme_excerpt: 'Fast JSON CLI',
        tags: [{ uid: 't1', name: 'dev', color: null }],
        created_at: '2026-10-03T00:00:00.000Z',
    }),
    link({
        uid: 'post',
        url: 'https://blog.example.com/p',
        domain: 'blog.example.com',
        kind: 'article',
        note: 'Idée pour le café',
        status: 'kept',
        created_at: '2026-10-02T00:00:00.000Z',
    }),
    link({
        uid: 'gone',
        url: 'https://github.com/c/d',
        domain: 'github.com',
        status: 'dropped',
        created_at: '2026-10-01T00:00:00.000Z',
    }),
];

describe('filterLinks', () => {
    it('hides dropped links by default, newest first', () => {
        expect(
            filterLinks(links, DEFAULT_LINK_FILTER).map((l) => l.uid)
        ).toEqual(['repo', 'post']);
    });

    it('searches title, note and README, ignoring accents and case', () => {
        const by = (query: string) =>
            filterLinks(links, { ...DEFAULT_LINK_FILTER, query }).map(
                (l) => l.uid
            );
        expect(by('json cli')).toEqual(['repo']);
        expect(by('IDEE cafe')).toEqual(['post']);
        expect(by('dev')).toEqual(['repo']);
    });

    it('filters by kind, status, tag and domain, and sorts oldest first', () => {
        const run = (f: Partial<typeof DEFAULT_LINK_FILTER>) =>
            filterLinks(links, { ...DEFAULT_LINK_FILTER, ...f }).map(
                (l) => l.uid
            );
        expect(run({ kind: 'article' })).toEqual(['post']);
        expect(run({ status: 'dropped' })).toEqual(['gone']);
        expect(run({ status: 'all', sort: 'oldest' })).toEqual([
            'gone',
            'post',
            'repo',
        ]);
        expect(run({ tag: 'dev' })).toEqual(['repo']);
        expect(run({ domain: 'github.com', status: 'all' })).toEqual([
            'repo',
            'gone',
        ]);
    });
});

describe('link helpers', () => {
    it('lists domains by use and tags alphabetically', () => {
        expect(domainsOf(links)).toEqual(['github.com', 'blog.example.com']);
        expect(tagsOf(links)).toEqual(['dev']);
    });

    it('finds the first url without trailing punctuation', () => {
        expect(firstUrl('see (https://a.io/x).')).toBe('https://a.io/x');
        expect(firstUrl('nothing')).toBeNull();
    });

    it('keeps the text written around the link', () => {
        expect(residualText('https://a.io - read later', 'https://a.io')).toBe(
            'read later'
        );
    });

    it('matches an inbox item to its link, else to the same page', () => {
        const own = link({
            uid: 'own',
            url: 'https://a.io/x',
            source_type: 'inbox_item',
            source_uid: 'i1',
        });
        expect(linkForItem([own], 'i1', 'https://a.io/x')?.uid).toBe('own');
        expect(linkForItem([own], 'i2', 'look https://A.io/x/#top')?.uid).toBe(
            'own'
        );
        expect(linkForItem([own], 'i3', 'no link')).toBeNull();
    });

    it('points to the source of a link', () => {
        expect(sourcePath(link({ source_type: 'task', source_uid: 't' }))).toBe(
            '/task/t'
        );
        expect(sourcePath(link({ source_type: 'note', source_uid: 'n' }))).toBe(
            '/notes/n'
        );
        expect(sourcePath(link({}))).toBeNull();
    });
});

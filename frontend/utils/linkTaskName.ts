import { firstUrl } from './linkFilters';
import { wordsAround } from './linkTriage';

// The task an address becomes (docs/37-links.md, Capture): the verb comes
// from the kind of page, the rest from its title. Mirror of
// backend/modules/links/core/taskName.js and Android `IdeaTasks`.

export type PageKind = 'repo' | 'article' | 'video' | 'tool' | 'other';

const REPO_HOSTS = new Set([
    'github.com',
    'gitlab.com',
    'codeberg.org',
    'bitbucket.org',
]);
const GITHUB_RESERVED = new Set([
    'features',
    'pricing',
    'about',
    'topics',
    'collections',
    'trending',
    'marketplace',
    'orgs',
    'settings',
    'explore',
    'sponsors',
    'login',
    'join',
    'search',
    'notifications',
    'enterprise',
]);
const VIDEO_HOSTS = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
];
const ARTICLE_HOSTS = [
    'medium.com',
    'dev.to',
    'substack.com',
    'hashnode.dev',
    'news.ycombinator.com',
];

const parse = (url: string): URL | null => {
    try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol)) return null;
        return parsed.hostname.includes('.') ? parsed : null;
    } catch {
        return null;
    }
};

const siteOf = (parsed: URL): string =>
    parsed.hostname.toLowerCase().replace(/^www\./, '');

const under = (domain: string, hosts: string[]): boolean =>
    hosts.some((host) => domain === host || domain.endsWith(`.${host}`));

const repoOf = (parsed: URL): { owner: string; repo: string } | null => {
    const domain = siteOf(parsed);
    if (!REPO_HOSTS.has(domain)) return null;
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    if (domain === 'github.com' && GITHUB_RESERVED.has(owner.toLowerCase())) {
        return null;
    }
    return { owner, repo: repo.replace(/\.git$/, '') };
};

// What a page is, from its address; `hint` is what the page said (og:type
// read by the server) when known.
export const classifyKind = (url: string, hint?: string | null): PageKind => {
    const parsed = parse(url);
    if (!parsed) return 'other';
    if (repoOf(parsed)) return 'repo';
    const domain = siteOf(parsed);
    const type = (hint ?? '').toLowerCase();
    if (under(domain, VIDEO_HOSTS) || type.startsWith('video')) {
        return 'video';
    }
    if (type === 'article' || under(domain, ARTICLE_HOSTS)) return 'article';
    if (parsed.pathname === '/' && parsed.search === '') return 'tool';
    return 'other';
};

const VERB_KEYS: Partial<Record<PageKind, string>> = {
    repo: 'links.taskVerb.try',
    tool: 'links.taskVerb.try',
    article: 'links.taskVerb.read',
    video: 'links.taskVerb.watch',
};

// The verb template of the user's language filled with the title.
type Verb = (key: string, title: string) => string;

// English templates, for `t(key, fallback, { title })`.
export const VERB_FALLBACKS: Record<string, string> = {
    'links.taskVerb.try': 'Try: {{title}}',
    'links.taskVerb.read': 'Read: {{title}}',
    'links.taskVerb.watch': 'Watch: {{title}}',
};

// The name and note of the task an address becomes. `title` is the page
// title when known; `words` were written with the address and go into the
// note under it.
export const capturedTask = (
    {
        url,
        title,
        kind,
        words,
    }: {
        url: string;
        title?: string | null;
        kind?: string | null;
        words?: string | null;
    },
    verb: Verb
): { name: string; note: string } => {
    const parsed = parse(url);
    const repo = parsed ? repoOf(parsed) : null;
    const fallback = repo
        ? `${repo.owner}/${repo.repo}`
        : parsed
          ? siteOf(parsed)
          : url;
    // A repository is named by its path: page titles there are long.
    const pageName = repo ? fallback : title?.trim() || fallback;
    const key = VERB_KEYS[(kind as PageKind) || classifyKind(url)];
    const name = key ? verb(key, pageName) : pageName;
    const rest = words?.trim();
    return { name, note: [url, rest].filter(Boolean).join('\n\n') };
};

// An idea that is nothing but an address becomes a task in one gesture.
export const isOnlyAddress = (text: string): boolean => {
    const url = firstUrl(text);
    return Boolean(url) && wordsAround(text, url as string).trim() === '';
};

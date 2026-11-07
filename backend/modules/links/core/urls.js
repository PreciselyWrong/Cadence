'use strict';

// Finding, normalizing and classifying links in free text. Pure functions:
// the same rules decide what a link is on every write path.

const CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = new Set([...'.,;:!?\'"»…*_']);
const TRACKING_PARAMS =
    /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src)$/i;
const MAX_URL_LENGTH = 2000;

function count(text, char) {
    return text.split(char).length - 1;
}

function trimEnd(raw) {
    let end = raw;
    while (end.length > 0) {
        const last = end[end.length - 1];
        const drop =
            TRAILING.has(last) ||
            (last === ')' && count(end, ')') > count(end, '(')) ||
            (last === ']' && count(end, ']') > count(end, '['));
        if (!drop) break;
        end = end.slice(0, -1);
    }
    return end;
}

function parse(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        if (!parsed.hostname.includes('.')) return null;
        return parsed;
    } catch {
        return null;
    }
}

// Distinct links of `text`, in order of appearance, as written.
function extractUrls(text) {
    if (typeof text !== 'string' || text.length === 0) return [];
    const found = [];
    for (const match of text.matchAll(CANDIDATE)) {
        const url = trimEnd(match[0]);
        if (url.length > MAX_URL_LENGTH || !parse(url)) continue;
        if (!found.includes(url)) found.push(url);
    }
    return found;
}

// One spelling per page: lowercase host, no default port, no fragment, no
// tracking parameters, no trailing slash except the root one.
function normalizeUrl(url) {
    const parsed = parse(url);
    if (!parsed) return null;
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
        if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    let href = parsed.href;
    if (parsed.search === '' && href.endsWith('?')) href = href.slice(0, -1);
    return href;
}

// What the user wrote around the link: the note captured with it.
function residualText(text, url) {
    if (typeof text !== 'string') return '';
    return text
        .replace(url, ' ')
        .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function domainOf(url) {
    const parsed = parse(url);
    return parsed ? parsed.hostname.toLowerCase().replace(/^www\./, '') : null;
}

const REPO_HOSTS = new Set([
    'github.com',
    'gitlab.com',
    'codeberg.org',
    'bitbucket.org',
]);
// First path segments of github.com that are site pages, not owners.
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
const VIDEO_HOSTS = new Set([
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
]);
const ARTICLE_HOSTS = new Set([
    'medium.com',
    'dev.to',
    'substack.com',
    'hashnode.dev',
    'news.ycombinator.com',
]);

function hostMatches(domain, hosts) {
    return [...hosts].some((h) => domain === h || domain.endsWith(`.${h}`));
}

// owner/repo of a repository url on a code host, or null.
function repoPath(url) {
    const parsed = parse(url);
    if (!parsed) return null;
    const domain = domainOf(url);
    if (!REPO_HOSTS.has(domain)) return null;
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    if (domain === 'github.com' && GITHUB_RESERVED.has(owner.toLowerCase())) {
        return null;
    }
    return { host: domain, owner, repo: repo.replace(/\.git$/, '') };
}

// repo | video | article | tool | other, from the url and the page's og:type.
function classifyKind(url, ogType = null) {
    const domain = domainOf(url);
    if (!domain) return 'other';
    if (repoPath(url)) return 'repo';
    const type = (ogType || '').toLowerCase();
    if (hostMatches(domain, VIDEO_HOSTS) || type.startsWith('video')) {
        return 'video';
    }
    if (type === 'article' || hostMatches(domain, ARTICLE_HOSTS)) {
        return 'article';
    }
    const parsed = parse(url);
    if (parsed.pathname === '/' && parsed.search === '') return 'tool';
    return 'other';
}

// Addresses that only give a task its context: a home server, a mailbox, a
// chat, a search, a CI run. They are never a page to read or try, so a
// captured text does not make them links. Hosts match with their subdomains.
const CONTEXT_SUFFIXES = [
    'lan',
    'local',
    'localhost',
    'localdomain',
    'internal',
    'intranet',
    'home.arpa',
    'ts.net',
];
const CONTEXT_HOSTS = [
    'mail.google.com',
    'calendar.google.com',
    'meet.google.com',
    'gemini.google.com',
    'chatgpt.com',
    'chat.openai.com',
    'claude.ai',
    'outlook.live.com',
    'outlook.office.com',
    'web.whatsapp.com',
];
const CONTEXT_PATHS = [
    { host: /^(www\.)?google\.[a-z.]+$/, path: /^\/search(\/|$)/ },
    {
        host: /^linkedin\.com$/,
        path: /^\/(feed|messaging|notifications)(\/|$)/,
    },
    { host: /^github\.com$/, path: /^\/[^/]+\/[^/]+\/actions(\/|$)/ },
    { host: /^gitlab\.com$/, path: /\/-\/(pipelines|jobs)(\/|$)/ },
];
const IP_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

function underHost(domain, host) {
    return domain === host || domain.endsWith(`.${host}`);
}

// True when `url` is context, not a link worth keeping. `extraHosts` are the
// server's own (TUDUDI_LINKS_IGNORE_HOSTS): its domains are private.
function isContextUrl(url, extraHosts = []) {
    const parsed = parse(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    if (IP_HOST.test(host)) return true;
    const domain = host.replace(/^www\./, '');
    if (CONTEXT_SUFFIXES.some((suffix) => underHost(domain, suffix))) {
        return true;
    }
    if ([...CONTEXT_HOSTS, ...extraHosts].some((h) => underHost(domain, h))) {
        return true;
    }
    return CONTEXT_PATHS.some(
        (rule) => rule.host.test(domain) && rule.path.test(parsed.pathname)
    );
}

module.exports = {
    extractUrls,
    normalizeUrl,
    residualText,
    domainOf,
    repoPath,
    classifyKind,
    isContextUrl,
};

'use strict';

// Duplicate links, found by code (docs/41-auto-classify.md): the same page
// under another spelling of its address, the same repository, the same
// video, or the same title on the same site. The new link is reported as a
// duplicate of the oldest one; nothing is ever dropped automatically.
const { normalizeUrl, domainOf, repoPath } = require('../../links/core/urls');

const TITLE_MIN = 8;

function youtubeId(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    const host = parsed.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') {
        return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
    const [kind, id] = parsed.pathname.split('/').filter(Boolean);
    return ['shorts', 'embed', 'live', 'v'].includes(kind) && id ? id : null;
}

// The address without its scheme or www., host in lower case.
function addressKey(url) {
    const normal = normalizeUrl(url);
    if (!normal) return null;
    const parsed = new URL(normal);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${host}${port}${parsed.pathname}${parsed.search}`;
}

function titleKey(title) {
    if (typeof title !== 'string') return null;
    const text = title
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return text.length >= TITLE_MIN ? text : null;
}

// Every key a link is known by; two links sharing one are the same thing.
function keysOf(link) {
    const keys = [];
    const address = addressKey(link.url);
    if (address) keys.push(`url:${address}`);
    const repo = repoPath(link.url);
    if (repo) {
        keys.push(`repo:${repo.host}/${repo.owner}/${repo.repo}`.toLowerCase());
    }
    const video = youtubeId(link.url);
    if (video) keys.push(`youtube:${video}`);
    const domain = domainOf(link.url);
    const title = titleKey(link.title);
    if (domain && title) keys.push(`title:${domain}|${title}`);
    return keys;
}

// Why two links are the same, for the card: the first key they share.
const REASONS = {
    url: 'address',
    repo: 'repository',
    youtube: 'video',
    title: 'title',
};

// The oldest link among `others` that `link` duplicates, with the reason, or
// null. Dropped links and the link itself never count.
function findDuplicate(link, others) {
    const keys = new Set(keysOf(link));
    if (keys.size === 0) return null;
    const older = others
        .filter((other) => other.uid !== link.uid && other.status !== 'dropped')
        .sort(
            (a, b) =>
                new Date(a.created_at) - new Date(b.created_at) || a.id - b.id
        );
    for (const other of older) {
        const shared = keysOf(other).find((key) => keys.has(key));
        if (shared) {
            return {
                original: other,
                reason: REASONS[shared.slice(0, shared.indexOf(':'))],
            };
        }
    }
    return null;
}

module.exports = { findDuplicate, keysOf, youtubeId, addressKey, titleKey };

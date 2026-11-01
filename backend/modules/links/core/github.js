'use strict';

// Public GitHub repositories through the unauthenticated REST API (60
// requests an hour per server address): stars, language, last push and the
// start of the README. The host is fixed, so no user-chosen address is ever
// requested here.

const API = 'https://api.github.com';
const TIMEOUT_MS = 6000;
const MAX_README_BYTES = 64 * 1024;
const EXCERPT_LENGTH = 400;

class GithubRateLimited extends Error {
    constructor(resetAt) {
        super('GitHub API rate limit reached');
        this.name = 'GithubRateLimited';
        this.resetAt = resetAt;
    }
}

async function request(fetchFn, url, accept) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetchFn(url, {
            headers: {
                Accept: accept,
                'User-Agent': 'Cadence-links',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            redirect: 'follow',
            signal: controller.signal,
        });
        if (
            (response.status === 403 || response.status === 429) &&
            response.headers.get('x-ratelimit-remaining') === '0'
        ) {
            const reset = Number(response.headers.get('x-ratelimit-reset'));
            throw new GithubRateLimited(
                Number.isFinite(reset) && reset > 0
                    ? reset * 1000
                    : Date.now() + 60 * 60 * 1000
            );
        }
        return response;
    } finally {
        clearTimeout(timer);
    }
}

// The first words of a README as plain text.
function readmeExcerpt(markdown, max = EXCERPT_LENGTH) {
    if (typeof markdown !== 'string') return null;
    const text = markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s*/gm, '')
        .replace(/^\s*[-*+>]\s+/gm, '')
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return null;
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

async function readme(fetchFn, base) {
    const response = await request(
        fetchFn,
        `${base}/readme`,
        'application/vnd.github.raw'
    );
    if (!response.ok) return null;
    const raw = await response.text();
    return readmeExcerpt(raw.slice(0, MAX_README_BYTES));
}

// Null when the repository does not exist or is private.
async function fetchRepo({ owner, repo }, { fetchFn = fetch } = {}) {
    const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const response = await request(
        fetchFn,
        base,
        'application/vnd.github+json'
    );
    if (!response.ok) return null;
    const data = await response.json();
    let excerpt = null;
    try {
        excerpt = await readme(fetchFn, base);
    } catch (error) {
        if (error instanceof GithubRateLimited) throw error;
    }
    return {
        stars: Number.isInteger(data.stargazers_count)
            ? data.stargazers_count
            : null,
        language: data.language ?? null,
        last_commit: data.pushed_at ?? null,
        description: data.description ?? null,
        name: data.full_name ?? `${owner}/${repo}`,
        readme_excerpt: excerpt,
    };
}

module.exports = { fetchRepo, readmeExcerpt, GithubRateLimited };

'use strict';

const { fetchPageMetadata } = require('../url/service');
const { fetchRepo, GithubRateLimited } = require('./core/github');
const { classifyKind, repoPath, domainOf } = require('./core/urls');

const MAX_TEXT = 500;

function clip(text, max = MAX_TEXT) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// The page's own metadata (SSRF-guarded direct fetch, size and time capped)
// and, for a public GitHub repository, its stats and README start. Null when
// nothing could be read. A GitHub rate limit is thrown to the caller.
async function fetchLinkMetadata(url, deps = {}) {
    const page = deps.fetchPage ?? fetchPageMetadata;
    const repoFetcher = deps.fetchRepo ?? fetchRepo;
    const repo = repoPath(url);
    const isGithub = repo && repo.host === 'github.com';
    if (isGithub && Date.now() < (deps.githubPausedUntil ?? 0)) {
        throw new GithubRateLimited(deps.githubPausedUntil);
    }
    const meta = await page(url).catch(() => null);
    const github = isGithub ? await repoFetcher(repo) : null;
    if (!meta && !github) return null;

    const pageTitle =
        meta?.title && meta.title !== domainOf(url) ? meta.title : null;
    return {
        title: clip(github?.name ?? pageTitle ?? meta?.title, 300),
        description: clip(github?.description ?? meta?.description),
        image_url: clip(meta?.image, 2000),
        site_name: clip(meta?.siteName, 200),
        kind: classifyKind(url, meta?.type),
        github_stars: github?.stars ?? null,
        github_language: github?.language ?? null,
        github_last_commit: github?.last_commit ?? null,
        readme_excerpt: github?.readme_excerpt ?? null,
    };
}

module.exports = { fetchLinkMetadata };

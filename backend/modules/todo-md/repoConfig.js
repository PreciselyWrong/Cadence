'use strict';

const path = require('path');

// Git repositories whose TODO.md is mirrored as a project, read from the
// environment on every call (tests and restarts change it):
//   TUDUDI_TODO_REPOS=cadence,notes
//   TUDUDI_TODO_REPO_<SLUG>_URL / _BRANCH / _PATH / _TOKEN / _USERNAME /
//   _SSH_KEY / _WEBHOOK_SECRET
// <SLUG> is the slug in capitals with '-' written '_'.

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;

const envKey = (slug) => slug.toUpperCase().replace(/-/g, '_');

function validBranch(branch) {
    return (
        BRANCH.test(branch) &&
        !branch.startsWith('-') &&
        !branch.startsWith('/') &&
        !branch.endsWith('/') &&
        !branch.endsWith('.lock') &&
        !branch.includes('..') &&
        !branch.includes('//')
    );
}

// A path inside the repository, never in .git, never above it.
function validFilePath(file) {
    if (!file || file.includes('\0') || file.includes('\\')) return false;
    if (path.posix.isAbsolute(file) || file.startsWith('-')) return false;
    const parts = file.split('/');
    return parts.every(
        (part) =>
            part !== '' && part !== '.' && part !== '..' && part !== '.git'
    );
}

// Any transport git knows, except the ones that run commands (ext::, fd::).
const validUrl = (url) => url !== '' && !url.startsWith('-') && !/::/.test(url);

// "github.com/owner/repo" for display: no scheme, no credentials, no .git.
function displayName(url) {
    return url
        .replace(/^[a-z+]+:\/\//i, '')
        .replace(/^[^@/]+@/, '')
        .replace(/\.git$/, '');
}

function repoFromEnv(slug, env) {
    const prefix = `TUDUDI_TODO_REPO_${envKey(slug)}_`;
    const read = (name) => (env[`${prefix}${name}`] || '').trim();
    const url = read('URL');
    const branch = read('BRANCH') || 'main';
    const file = read('PATH') || 'TODO.md';
    if (!validUrl(url) || !validBranch(branch) || !validFilePath(file)) {
        return null;
    }
    return {
        slug,
        url,
        branch,
        path: file,
        token: read('TOKEN') || null,
        username: read('USERNAME') || null,
        sshKey: read('SSH_KEY') || null,
        webhookSecret: read('WEBHOOK_SECRET') || null,
        display: displayName(url),
    };
}

// The repositories that are configured completely and correctly; the others
// are left out (and reported by `invalidSlugs`).
function configuredRepos(env = process.env) {
    const seen = new Set();
    const repos = [];
    for (const raw of (env.TUDUDI_TODO_REPOS || '').split(',')) {
        const slug = raw.trim().toLowerCase();
        if (!SLUG.test(slug) || seen.has(slug)) continue;
        seen.add(slug);
        const repo = repoFromEnv(slug, env);
        if (repo) repos.push(repo);
    }
    return repos;
}

function invalidSlugs(env = process.env) {
    const valid = new Set(configuredRepos(env).map((r) => r.slug));
    const slugs = (env.TUDUDI_TODO_REPOS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s !== '' && !valid.has(s));
    return [...new Set(slugs)];
}

const findRepo = (slug, env = process.env) =>
    configuredRepos(env).find((r) => r.slug === slug) || null;

function gitDir(env = process.env) {
    const configured = (env.TUDUDI_TODO_GIT_DIR || '').trim();
    if (configured) return path.resolve(configured);
    const { getConfig } = require('../../config/config');
    return path.join(path.dirname(getConfig().dbFile), 'todo-repos');
}

module.exports = {
    configuredRepos,
    invalidSlugs,
    findRepo,
    gitDir,
    displayName,
    validFilePath,
    validBranch,
};

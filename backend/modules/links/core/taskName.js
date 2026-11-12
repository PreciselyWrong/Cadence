'use strict';

// The name of the task an address becomes (docs/37-links.md). Plain code:
// the verb comes from the kind of page, the rest from its title. Android
// (`model/IdeaTasks`) and the web follow the same rule.

const { classifyKind, domainOf, repoPath } = require('./urls');

const VERB_KEYS = {
    repo: 'links.taskVerb.try',
    tool: 'links.taskVerb.try',
    article: 'links.taskVerb.read',
    video: 'links.taskVerb.watch',
};

// The translation key of the verb for a kind of page; null for no verb.
function taskVerbKey(kind) {
    return VERB_KEYS[kind] ?? null;
}

// What the page is called when its title is unknown: the repository, else
// the site, else the address itself.
function fallbackTitle(url) {
    const repo = repoPath(url);
    if (repo) return `${repo.owner}/${repo.repo}`;
    return domainOf(url) || url;
}

// « Essayer : <title> », « Lire : … », « Regarder : … » or the title alone.
// `translate(key)` gives the template of the user's language ({{title}}), or
// null when it has none.
function taskNameFor({ url, title, kind }, translate) {
    // A repository is named by its path: page titles there are long
    // ("GitHub - owner/repo: description").
    const repo = repoPath(url);
    const name = repo
        ? `${repo.owner}/${repo.repo}`
        : (typeof title === 'string' && title.trim()) || fallbackTitle(url);
    const key = taskVerbKey(kind || classifyKind(url));
    const template = key ? translate(key) : null;
    return template ? template.replace('{{title}}', name) : name;
}

// The web addresses written in a text, in order, without the punctuation
// that closes a sentence or a parenthesis around them.
function urlsIn(text) {
    if (typeof text !== 'string' || !text) return [];
    const found = text.match(/https?:\/\/[^\s<>"'`]+/gi) || [];
    return found.map((url) => {
        let clean = url.replace(/[.,;:!?…]+$/, '');
        while (clean.endsWith(')') && !clean.includes('(')) {
            clean = clean.slice(0, -1).replace(/[.,;:!?…]+$/, '');
        }
        return clean;
    });
}

module.exports = { taskVerbKey, taskNameFor, urlsIn };

'use strict';

const repository = require('./repository');
const { findLinkTo, snippetAround, normalizeTitle } = require('./core/parse');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const { isValidUid } = require('../../utils/uid');

const MAX_BACKLINKS = 100;
const MAX_NAMES = 100;

// Fragments a linking text must contain: the target's uid (paths and
// mentions), and for notes and tasks their [[title]] form.
function fragmentsFor(target) {
    const fragments = [target.uid];
    if (target.type === 'note' && target.title) {
        fragments.push(`[[%${target.title.trim()}%]]`);
    }
    if (target.type === 'task' && target.title) {
        fragments.push(`[[%task:%${target.title.trim()}%]]`);
    }
    return fragments;
}

// The notes and tasks the user can read that link to the note, task or
// person `uid`, most recently changed first, each with a snippet.
async function backlinks(userId, type, uid) {
    const target = isValidUid(uid)
        ? await repository.findTarget(type, uid)
        : null;
    if (!target) throw new NotFoundError('Not found.');

    const fragments = fragmentsFor(target);
    const candidates = [
        ...(await repository.findCandidates(userId, 'note', fragments)),
        ...(await repository.findCandidates(userId, 'task', fragments)),
    ];

    const results = [];
    for (const candidate of candidates) {
        if (candidate.type === type && candidate.uid === uid) continue;
        const link = findLinkTo(candidate.text, target);
        if (!link) continue;
        results.push({
            type: candidate.type,
            uid: candidate.uid,
            title: candidate.title,
            snippet: snippetAround(candidate.text, link.index),
            updated_at: candidate.updated_at,
        });
    }
    return results
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, MAX_BACKLINKS);
}

// The task each [[task:Name]] opens: { tasks: { "<name, lowercased>": uid } }.
// Done, and done then archived.
const DONE_STATUSES = [2, 3];

async function resolve(userId, body) {
    const names = Array.isArray(body?.tasks) ? body.tasks : [];
    if (
        names.length > MAX_NAMES ||
        names.some((n) => typeof n !== 'string' || n.length > 500)
    ) {
        throw new ValidationError('tasks must be a list of task names.');
    }
    const wanted = [...new Set(names.map(normalizeTitle).filter(Boolean))];
    const tasks = {};
    // The names whose task is done: an outline checkbox linked to the task
    // reads as checked.
    const done = [];
    if (wanted.length > 0) {
        const rows = await repository.findTasksByName(userId, wanted);
        for (const row of rows) {
            const key = normalizeTitle(row.name || '');
            if (!wanted.includes(key) || tasks[key]) continue;
            tasks[key] = row.uid;
            if (DONE_STATUSES.includes(row.status)) done.push(key);
        }
    }
    return { tasks, done };
}

module.exports = { backlinks, resolve };

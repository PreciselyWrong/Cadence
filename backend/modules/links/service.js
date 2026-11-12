'use strict';

const linksRepository = require('./repository');
const {
    addressKey,
    classifyKind,
    domainOf,
    normalizeUrl,
} = require('./core/urls');
const { taskNameFor, urlsIn } = require('./core/taskName');
const { translate } = require('../spreadsheets/core/locales');
const taskRepository = require('../tasks/repository');
const entitlements = require('../../services/entitlementsService');
const { validateProjectAccess } = require('../tasks/utils/validation');
const permissionsService = require('../../services/permissionsService');
const {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} = require('../../shared/errors');

const MAX_NOTE = 5000;

function iso(value) {
    return value instanceof Date ? value.toISOString() : (value ?? null);
}

function serializeLink(link) {
    return {
        uid: link.uid,
        url: link.url,
        domain: domainOf(link.url),
        title: link.title,
        description: link.description,
        image_url: link.image_url,
        site_name: link.site_name,
        kind: link.kind,
        github_stars: link.github_stars,
        github_language: link.github_language,
        github_last_commit: iso(link.github_last_commit),
        readme_excerpt: link.readme_excerpt,
        note: link.note,
        project_uid: link.Project?.uid ?? null,
        project_name: link.Project?.name ?? null,
        fetch_status: link.fetch_status,
        fetched_at: iso(link.fetched_at),
        created_at: iso(link.created_at),
        updated_at: iso(link.updated_at),
    };
}

async function get(userId, uid) {
    const link = await linksRepository.findByUid(userId, uid);
    if (!link) throw new NotFoundError('Link not found');
    return serializeLink(link);
}

const MAX_TITLE = 500;

// A page added to a project (Projet… of a capture, the add-on, agents).
// The same address twice in a project is one page: what it holds stays.
async function addOne(userId, item = {}) {
    const url = typeof item.url === 'string' ? normalizeUrl(item.url) : null;
    if (!url) throw new ValidationError('url must be an http(s) address');
    const projectId = await projectChange(userId, item.project_uid);
    if (!projectId) {
        throw new ValidationError(
            'project_uid is required: a link is a page of a project'
        );
    }
    const existing = await linksRepository.findByUrl(userId, url, projectId);
    if (existing) return { link: existing, created: false };
    await linksRepository.lift(userId, url);
    const title =
        typeof item.title === 'string'
            ? item.title.trim().slice(0, MAX_TITLE)
            : '';
    const note = typeof item.note === 'string' ? item.note.trim() : '';
    try {
        const link = await linksRepository.create({
            user_id: userId,
            url,
            kind: classifyKind(url),
            title: title || null,
            note: note.slice(0, MAX_NOTE) || null,
            project_id: projectId,
        });
        return { link, created: true };
    } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        // Saved meanwhile by another request.
        return {
            link: await linksRepository.findByUrl(userId, url, projectId),
            created: false,
        };
    }
}

async function create(userId, body) {
    const { link, created } = await addOne(userId, body);
    if (created) require('./jobs').enqueueFetch(link.id);
    const saved = await linksRepository.findByUid(userId, link.uid);
    return { link: serializeLink(saved), created };
}

// What moving a link to another page resets: the reading was of the old one.
const UNREAD = {
    description: null,
    image_url: null,
    site_name: null,
    github_stars: null,
    github_language: null,
    github_last_commit: null,
    readme_excerpt: null,
    fetch_status: 'pending',
    fetched_at: null,
};

async function addressChanges(link, value) {
    const url = typeof value === 'string' ? normalizeUrl(value) : null;
    if (!url) throw new ValidationError('url must be an http(s) address');
    if (url === link.url) return {};
    if (await linksRepository.findByUrl(link.user_id, url, link.project_id)) {
        throw new ConflictError('Another link already has this address');
    }
    return { ...UNREAD, url, kind: classifyKind(url) };
}

function titleChange(value) {
    if (value !== null && typeof value !== 'string') {
        throw new ValidationError('title must be a string');
    }
    return value ? value.trim().slice(0, MAX_TITLE) || null : null;
}

async function projectChange(userId, uid) {
    if (uid === null || uid === '' || uid === undefined) return null;
    try {
        return await validateProjectAccess(uid, userId);
    } catch {
        throw new ValidationError('project_uid is not a project of yours');
    }
}

// The user's part of a page: title, address, note and project.
async function update(userId, uid, body = {}) {
    const link = await linksRepository.findByUid(userId, uid);
    if (!link) throw new NotFoundError('Link not found');
    const changes = {};
    if ('title' in body) changes.title = titleChange(body.title);
    if ('project_uid' in body) {
        const projectId = await projectChange(userId, body.project_uid);
        if (!projectId) throw new ValidationError('project_uid is required');
        changes.project_id = projectId;
    }
    if ('url' in body)
        Object.assign(changes, await addressChanges(link, body.url));
    if ('note' in body) {
        if (body.note !== null && typeof body.note !== 'string') {
            throw new ValidationError('note must be a string');
        }
        const note = body.note ? body.note.trim().slice(0, MAX_NOTE) : '';
        changes.note = note || null;
    }
    const previousUrl = link.url;
    if (Object.keys(changes).length) await link.update(changes);
    if (changes.url) {
        // The old address may still be in a text.
        await linksRepository.exclude(userId, previousUrl);
        await linksRepository.lift(userId, changes.url);
        require('./jobs').enqueueFetch(link.id);
    }
    return get(userId, uid);
}

async function remove(userId, uid) {
    const link = await linksRepository.findByUid(userId, uid);
    if (!link) throw new NotFoundError('Link not found');
    await linksRepository.remove(link);
    return { uid, deleted: true };
}

function validAddress(value) {
    const url = typeof value === 'string' ? normalizeUrl(value.trim()) : null;
    if (!url) throw new ValidationError('url must be an http(s) address');
    return url;
}

// The name of the task an address becomes, in the user's language.
function taskName(user, { url, title, kind }) {
    return taskNameFor({ url, title, kind }, (key) =>
        translate(user?.language || 'en', key)
    );
}

// The prefilter of a task text: host without www. and path, as written.
function needleOf(url) {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${host}${path}`;
}

// The address with and without "www.", as pages may be stored.
function spellingsOf(url) {
    const bare = url.replace(/^(https?:\/\/)www\./i, '$1');
    return [...new Set([url, bare, bare.replace(/^(https?:\/\/)/i, '$1www.')])];
}

// Where an address already is, before it is captured again: the open tasks
// whose name or note holds it (same normalized address) and the projects
// that hold it. With the name the new task would get.
async function lookup(user, { url: raw, title } = {}) {
    const url = validAddress(raw);
    const candidates = await linksRepository.openTasksMentioning(
        user.id,
        needleOf(url)
    );
    const key = addressKey(url);
    const tasks = candidates
        .filter((task) =>
            urlsIn(`${task.name ?? ''}\n${task.note ?? ''}`).some(
                (found) => addressKey(found) === key
            )
        )
        .map((task) => ({ uid: task.uid, name: task.name }));
    const projects = (
        await linksRepository.projectsHolding(user.id, spellingsOf(url))
    ).map((project) => ({ uid: project.uid, name: project.name }));
    const kind = classifyKind(url);
    return {
        url,
        kind,
        task_name: taskName(user, { url, title, kind }),
        tasks,
        projects,
    };
}

// An address made a task in one gesture (add-on, agents): named by its kind
// unless a name is given, the address in the note, waiting in « Tâches à
// classer » for « Quand ? » unless a project is given.
async function captureTask(user, body = {}) {
    const url = validAddress(body.url);
    const projectId = body.project_uid
        ? await projectChange(user.id, body.project_uid)
        : null;
    const typed = typeof body.name === 'string' ? body.name.trim() : '';
    const name = (typed || taskName(user, { url, title: body.title })).slice(
        0,
        MAX_TITLE
    );
    const words = typeof body.note === 'string' ? body.note.trim() : '';
    await entitlements.assertCanCreate(user.id, 'task');
    const task = await taskRepository.create({
        user_id: user.id,
        name,
        note: [url, words].filter(Boolean).join('\n\n').slice(0, MAX_NOTE),
        status: 0,
        project_id: projectId,
        needs_when: !projectId,
        source: 'link',
        source_url: url,
    });
    return { task: { uid: task.uid, name: task.name, note: task.note } };
}

const PAGES_MAX = 100;

// The project of a pages request; reading needs access, writing needs
// write access.
async function projectFor(user, uid, write) {
    const project = await linksRepository.findProject(uid);
    if (!project) throw new NotFoundError('Project not found');
    const access = await permissionsService.getAccess(user.id, 'project', uid);
    if (access === 'none' || (write && access === 'ro')) {
        throw new ForbiddenError('Forbidden');
    }
    return project;
}

async function listPages(user, projectUid) {
    const project = await projectFor(user, projectUid, false);
    const rows = await linksRepository.pagesOf(project.id);
    return { pages: rows.map(serializeLink) };
}

// One page (`{ url, title?, note? }`, 201 when new) or a tab group
// (`{ pages: [...] }`, counted). The same address twice is one page.
async function addPages(user, projectUid, body = {}) {
    const project = await projectFor(user, projectUid, true);
    const asPage = (item) => ({
        url: item?.url,
        title: item?.title,
        note: item?.note,
        project_uid: project.uid,
    });
    if (Array.isArray(body.pages)) {
        if (body.pages.length > PAGES_MAX) {
            throw new ValidationError(
                `pages must be a list of at most ${PAGES_MAX} pages`
            );
        }
        const result = { created: 0, existing: 0, invalid: 0 };
        for (const item of body.pages) {
            try {
                const { link, created } = await addOne(user.id, asPage(item));
                result[created ? 'created' : 'existing'] += 1;
                if (created) require('./jobs').enqueueFetch(link.id);
            } catch (error) {
                if (!(error instanceof ValidationError)) throw error;
                result.invalid += 1;
            }
        }
        return { status: 200, body: result };
    }
    const { link, created } = await addOne(user.id, asPage(body));
    if (created) require('./jobs').enqueueFetch(link.id);
    const saved = await linksRepository.findByUid(link.user_id, link.uid);
    return {
        status: created ? 201 : 200,
        body: { page: serializeLink(saved), created },
    };
}

// « Vérifier les pages »: ok, dead or unknown for each page; nothing is
// deleted.
async function checkPages(user, projectUid) {
    const project = await projectFor(user, projectUid, false);
    const rows = await linksRepository.pagesOf(project.id);
    const results = [];
    for (const row of rows) {
        const { state, code } = await require('./check').checkUrl(row.url);
        results.push({ uid: row.uid, url: row.url, state, code });
    }
    return { results };
}

module.exports = {
    listPages,
    addPages,
    checkPages,
    lookup,
    captureTask,
    taskName,
    get,
    create,
    update,
    remove,
    serializeLink,
};

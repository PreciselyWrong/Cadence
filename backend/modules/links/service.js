'use strict';

const { Tag } = require('../../models');
const linksRepository = require('./repository');
const { LINK_STATUSES, normalizeLinkStatus } = require('./core/constants');
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
const { isDay } = require('./core/reviewDate');
const { validateTagName } = require('../tags/tagsService');
const { validateProjectAccess } = require('../tasks/utils/validation');
const {
    ConflictError,
    NotFoundError,
    ValidationError,
} = require('../../shared/errors');

const MAX_NOTE = 5000;

function iso(value) {
    return value instanceof Date ? value.toISOString() : (value ?? null);
}

function serializeLink(link) {
    const tags = (link.Tags || [])
        .map((t) => ({ uid: t.uid, name: t.name, color: t.color ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
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
        status: link.status,
        project_uid: link.Project?.uid ?? null,
        project_name: link.Project?.name ?? null,
        review_at: link.review_at ?? null,
        tags,
        source_type: link.source_type,
        source_uid: link.source_uid,
        fetch_status: link.fetch_status,
        fetched_at: iso(link.fetched_at),
        created_at: iso(link.created_at),
        updated_at: iso(link.updated_at),
    };
}

async function list(userId, filters) {
    const { rows, total } = await linksRepository.list(userId, filters);
    return { links: rows.map(serializeLink), total };
}

async function get(userId, uid) {
    const link = await linksRepository.findByUid(userId, uid);
    if (!link) throw new NotFoundError('Link not found');
    return serializeLink(link);
}

async function resolveTags(names, userId) {
    if (!Array.isArray(names)) {
        throw new ValidationError('tags must be an array of tag names');
    }
    const valid = [];
    for (const name of names) {
        const raw = typeof name === 'object' && name ? name.name : name;
        const check = validateTagName(typeof raw === 'string' ? raw : '');
        if (!check.valid) {
            throw new ValidationError(
                `Invalid tag name "${raw}": ${check.error}`
            );
        }
        if (!valid.includes(check.name)) valid.push(check.name);
    }
    // One at a time: a path creates its missing ancestors.
    const tags = [];
    for (const name of valid) {
        const [tag] = await Tag.findOrCreate({
            where: { name, user_id: userId },
            defaults: { name, user_id: userId },
        });
        tags.push(tag);
    }
    return tags;
}

const MAX_TITLE = 500;
const IMPORT_MAX = 500;
const SOURCE_TYPES = ['inbox_item', 'task', 'note'];

// The idea, task or note a link is added from on purpose: one of the user's own.
async function sourceOf(userId, item) {
    if (item.source_type === undefined && item.source_uid === undefined) {
        return {};
    }
    if (
        !SOURCE_TYPES.includes(item.source_type) ||
        typeof item.source_uid !== 'string' ||
        !item.source_uid
    ) {
        throw new ValidationError(
            `source_type must be one of ${SOURCE_TYPES.join(', ')}, with a source_uid`
        );
    }
    const found = await linksRepository.sourceExists(
        userId,
        item.source_type,
        item.source_uid
    );
    if (!found) throw new NotFoundError('Source not found');
    return { source_type: item.source_type, source_uid: item.source_uid };
}

// A link given directly, without a text to find it in (import, add-on, agents,
// or a task or note on purpose). The same page twice is one link: what it
// already holds stays.
async function addOne(userId, item = {}) {
    const url = typeof item.url === 'string' ? normalizeUrl(item.url) : null;
    if (!url) throw new ValidationError('url must be an http(s) address');
    const source = await sourceOf(userId, item);
    const existing = await linksRepository.findByUrl(userId, url);
    if (existing) return { link: existing, created: false };
    await linksRepository.lift(userId, url);
    const { fields: state, invalid } = normalizeLinkStatus({
        status: item.status ?? 'new',
    });
    if (invalid) {
        throw new ValidationError(
            `status must be one of ${LINK_STATUSES.join(', ')}`
        );
    }
    const projectId = await projectChange(userId, item.project_uid);
    const title =
        typeof item.title === 'string'
            ? item.title.trim().slice(0, MAX_TITLE)
            : '';
    const note = typeof item.note === 'string' ? item.note.trim() : '';
    const tags = item.tags?.length ? await resolveTags(item.tags, userId) : [];
    let link;
    try {
        link = await linksRepository.create({
            user_id: userId,
            url,
            kind: classifyKind(url),
            title: title || null,
            note: note.slice(0, MAX_NOTE) || null,
            status: state.status,
            review_at: state.review_at ?? null,
            project_id: projectId,
            ...source,
        });
    } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        // Saved meanwhile by another request.
        return {
            link: await linksRepository.findByUrl(userId, url),
            created: false,
        };
    }
    if (tags.length) await linksRepository.setTags(link, tags);
    return { link, created: true };
}

async function create(userId, body) {
    const { link, created } = await addOne(userId, body);
    if (created) require('./jobs').enqueueFetch(link.id);
    const saved = await linksRepository.findByUid(userId, link.uid);
    return { link: serializeLink(saved), created };
}

// Bookmarks read by the client, by batches. One bad entry never stops the rest.
async function importLinks(userId, items) {
    if (!Array.isArray(items) || items.length > IMPORT_MAX) {
        throw new ValidationError(
            `items must be a list of at most ${IMPORT_MAX} bookmarks`
        );
    }
    const result = { created: 0, existing: 0, invalid: 0 };
    for (const item of items) {
        try {
            const { link, created } = await addOne(userId, item);
            result[created ? 'created' : 'existing'] += 1;
            if (created) require('./jobs').enqueueFetch(link.id);
        } catch (error) {
            if (!(error instanceof ValidationError)) throw error;
            result.invalid += 1;
        }
    }
    return result;
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
    if (await linksRepository.findByUrl(link.user_id, url)) {
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
    if (uid === null || uid === '') return null;
    try {
        return await validateProjectAccess(uid, userId);
    } catch {
        throw new ValidationError('project_uid is not a project of yours');
    }
}

// The user's part of a link: title, address, note, status, project and tags.
async function update(userId, uid, input = {}) {
    const link = await linksRepository.findByUid(userId, uid);
    if (!link) throw new NotFoundError('Link not found');
    const { fields: body, invalid } = normalizeLinkStatus(input);
    if (invalid) {
        throw new ValidationError(
            `status must be one of ${LINK_STATUSES.join(', ')}`
        );
    }
    const changes = {};
    if ('title' in body) changes.title = titleChange(body.title);
    if ('project_uid' in body) {
        changes.project_id = await projectChange(userId, body.project_uid);
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
    if ('status' in body) {
        changes.status = body.status;
    }
    if ('review_at' in body) {
        if (
            body.review_at !== null &&
            body.review_at !== '' &&
            !isDay(body.review_at)
        ) {
            throw new ValidationError(
                'review_at must be a date (YYYY-MM-DD) or null'
            );
        }
        changes.review_at = body.review_at || null;
    }
    const tags =
        'tags' in body ? await resolveTags(body.tags, userId) : undefined;
    const previousUrl = link.url;
    if (Object.keys(changes).length) await link.update(changes);
    if (tags) await link.setTags(tags);
    if (changes.url) {
        // The old address may still be in the text the link came from.
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

module.exports = {
    lookup,
    captureTask,
    taskName,
    list,
    get,
    create,
    importLinks,
    update,
    remove,
    serializeLink,
};

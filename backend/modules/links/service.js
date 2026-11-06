'use strict';

const { Tag } = require('../../models');
const linksRepository = require('./repository');
const { LINK_STATUSES } = require('./core/constants');
const { classifyKind, domainOf, normalizeUrl } = require('./core/urls');
const { isDay, laterReviewDay } = require('./core/reviewDate');
const { validateTagName } = require('../tags/tagsService');
const { NotFoundError, ValidationError } = require('../../shared/errors');

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

// A link given directly, without a text to find it in (import, add-on, agents).
// The same page twice is one link: what it already holds stays.
async function addOne(userId, item = {}) {
    const url = typeof item.url === 'string' ? normalizeUrl(item.url) : null;
    if (!url) throw new ValidationError('url must be an http(s) address');
    const existing = await linksRepository.findByUrl(userId, url);
    if (existing) return { link: existing, created: false };
    const status = item.status ?? 'new';
    if (!LINK_STATUSES.includes(status)) {
        throw new ValidationError(
            `status must be one of ${LINK_STATUSES.join(', ')}`
        );
    }
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
            status,
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

// The user's part of a link: note, status and tags.
async function update(userId, uid, body = {}) {
    const link = await linksRepository.findByUid(userId, uid);
    if (!link) throw new NotFoundError('Link not found');
    const changes = {};
    if ('note' in body) {
        if (body.note !== null && typeof body.note !== 'string') {
            throw new ValidationError('note must be a string');
        }
        const note = body.note ? body.note.trim().slice(0, MAX_NOTE) : '';
        changes.note = note || null;
    }
    if ('status' in body) {
        if (!LINK_STATUSES.includes(body.status)) {
            throw new ValidationError(
                `status must be one of ${LINK_STATUSES.join(', ')}`
            );
        }
        changes.status = body.status;
        // Parked for a later look: a fresh review day unless one is given.
        if (body.status === 'parked' && !('review_at' in body)) {
            changes.review_at = laterReviewDay();
        }
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
    if (Object.keys(changes).length) await link.update(changes);
    if (tags) await link.setTags(tags);
    return get(userId, uid);
}

module.exports = { list, get, create, importLinks, update, serializeLink };

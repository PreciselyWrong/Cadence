'use strict';

const { Tag } = require('../../models');
const linksRepository = require('./repository');
const { LINK_STATUSES } = require('./core/constants');
const { domainOf } = require('./core/urls');
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
    }
    const tags =
        'tags' in body ? await resolveTags(body.tags, userId) : undefined;
    if (Object.keys(changes).length) await link.update(changes);
    if (tags) await link.setTags(tags);
    return get(userId, uid);
}

module.exports = { list, get, update, serializeLink };

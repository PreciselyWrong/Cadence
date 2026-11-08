'use strict';

const { Op } = require('sequelize');
const {
    InboxItem,
    Link,
    LinkExclusion,
    Note,
    Project,
    Tag,
    Task,
    sequelize,
} = require('../../models');
const { ciLike } = require('../../utils/db-dialect');
const { foldLinkStatus } = require('./core/constants');

// An idea the user threw away cannot be the source of a link.
const DISCARDED_INBOX = ['deleted', 'trashed'];

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

const withTags = {
    model: Tag,
    attributes: ['id', 'uid', 'name', 'color'],
    through: { attributes: [] },
};

const withProject = {
    model: Project,
    attributes: ['uid', 'name'],
    required: false,
};

function listOf(value) {
    if (value === undefined || value === null || value === '') return null;
    const items = Array.isArray(value) ? value : String(value).split(',');
    const clean = items.map((v) => String(v).trim()).filter(Boolean);
    return clean.length ? clean : null;
}

function escapeLike(text) {
    return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Filters shared by the REST list and the MCP tool.
function whereFor(userId, filters = {}) {
    const where = { user_id: userId };
    const and = [];
    const statuses = listOf(filters.status);
    if (statuses) {
        where.status = {
            [Op.in]: [...new Set(statuses.map(foldLinkStatus))],
        };
    }
    const kinds = listOf(filters.kind);
    if (kinds) where.kind = { [Op.in]: kinds };
    if (filters.source_type) where.source_type = filters.source_type;
    if (filters.source_uid) where.source_uid = filters.source_uid;
    if (filters.readable === true) {
        and.push(
            { status: { [Op.ne]: 'dropped' } },
            { fetch_status: { [Op.ne]: 'pending' } }
        );
    }

    if (filters.domain) {
        const domain = escapeLike(
            String(filters.domain)
                .toLowerCase()
                .replace(/^www\./, '')
        );
        and.push({
            [Op.or]: [
                { url: { [Op.like]: `%://${domain}/%` } },
                { url: { [Op.like]: `%://www.${domain}/%` } },
            ],
        });
    }
    if (filters.q) {
        const pattern = `%${escapeLike(String(filters.q).trim())}%`;
        and.push({
            [Op.or]: [
                'title',
                'description',
                'url',
                'note',
                'readme_excerpt',
            ].map((column) => ({ [column]: ciLike(pattern) })),
        });
    }
    const tagged = sequelize.literal(
        `(SELECT lt.link_id FROM links_tags lt JOIN tags t ON t.id = lt.tag_id WHERE t.user_id = ${sequelize.escape(userId)}${
            filters.tag
                ? ` AND t.name = ${sequelize.escape(String(filters.tag))}`
                : ''
        })`
    );
    if (filters.tag) and.push({ id: { [Op.in]: tagged } });
    if (filters.untagged === true || filters.untagged === 'true') {
        and.push({ id: { [Op.notIn]: tagged } });
    }
    if (and.length) where[Op.and] = and;
    return where;
}

async function list(userId, filters = {}) {
    const limit = Math.min(
        Math.max(parseInt(filters.limit, 10) || DEFAULT_LIMIT, 1),
        MAX_LIMIT
    );
    const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
    const direction = filters.sort === 'oldest' ? 'ASC' : 'DESC';
    const where = whereFor(userId, filters);
    const [rows, total] = await Promise.all([
        Link.findAll({
            where,
            include: [withTags, withProject],
            order: [
                ['created_at', direction],
                ['id', direction],
            ],
            limit,
            offset,
        }),
        Link.count({ where }),
    ]);
    return { rows, total };
}

// Links still to read whose review day has come, oldest day first.
function dueForReview(userId, today) {
    return Link.findAll({
        where: {
            user_id: userId,
            status: { [Op.ne]: 'dropped' },
            review_at: { [Op.lte]: today },
        },
        attributes: ['uid', 'url', 'title', 'review_at'],
        order: [
            ['review_at', 'ASC'],
            ['id', 'ASC'],
        ],
        raw: true,
    });
}

function findByUid(userId, uid) {
    return Link.findOne({
        where: { uid, user_id: userId },
        include: [withTags, withProject],
    });
}

function findByUrl(userId, url) {
    return Link.findOne({ where: { user_id: userId, url } });
}

function create(fields) {
    return Link.create(fields);
}

function setTags(link, tags) {
    return link.setTags(tags);
}

function exclude(userId, url) {
    return LinkExclusion.findOrCreate({ where: { user_id: userId, url } });
}

function liftExclusion(userId, url) {
    return LinkExclusion.destroy({ where: { user_id: userId, url } });
}

async function excludedUrls(userId, urls) {
    const rows = await LinkExclusion.findAll({
        where: { user_id: userId, url: { [Op.in]: urls } },
        attributes: ['url'],
        raw: true,
    });
    return new Set(rows.map((row) => row.url));
}

const SOURCE_MODELS = { inbox_item: InboxItem, task: Task, note: Note };

async function sourceExists(userId, type, uid) {
    const where = { user_id: userId, uid };
    if (type === 'inbox_item') {
        where.status = { [Op.notIn]: DISCARDED_INBOX };
    }
    const row = await SOURCE_MODELS[type].findOne({
        where,
        attributes: ['id'],
    });
    return Boolean(row);
}

// Deleting keeps the page out of capture: its address may still be in a text.
async function remove(link) {
    await exclude(link.user_id, link.url);
    await link.destroy();
}

module.exports = {
    dueForReview,
    list,
    findByUid,
    findByUrl,
    create,
    setTags,
    whereFor,
    exclude,
    lift: liftExclusion,
    excludedUrls,
    sourceExists,
    remove,
};

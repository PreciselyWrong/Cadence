'use strict';

const { Op } = require('sequelize');
const jobs = require('./jobs');
const { ciLike } = require('../../utils/db-dialect');
const {
    extractUrls,
    normalizeUrl,
    residualText,
    classifyKind,
} = require('./core/urls');

// At most this many links are taken from one row.
const MAX_PER_SOURCE = 20;

// Text around the address beyond which an inbox item is an idea, not a share.
const SHARED_TEXT_MAX = 120;

// Where links are looked for, per model: the source type stored on the
// link and the text fields read.
const SOURCES = {
    InboxItem: { type: 'inbox_item', fields: ['content'] },
    Task: { type: 'task', fields: ['name', 'note'] },
    Note: { type: 'note', fields: ['title', 'content'] },
};

function isUniqueViolation(error) {
    return error && error.name === 'SequelizeUniqueConstraintError';
}

// Finds the links of one saved row and makes sure each has a Link. A new
// link from an inbox item that holds only that link takes the rest of the
// text as its note: what the user wrote next to it at capture. An existing
// link first seen in the inbox moves to the task or note it went to.
async function captureFrom(
    { userId, type, uid, texts },
    { fresh = false } = {}
) {
    const { Link } = require('../../models');
    const raw = texts.filter(Boolean).join('\n');
    const urls = extractUrls(raw).slice(0, MAX_PER_SOURCE);
    const normalized = [
        ...new Map(
            urls.map((u) => [normalizeUrl(u), u]).filter(([n]) => n)
        ).entries(),
    ];
    if (normalized.length === 0) return [];

    const existing = await Link.findAll({
        where: {
            user_id: userId,
            url: { [Op.in]: normalized.map(([n]) => n) },
        },
    });
    const byUrl = new Map(existing.map((l) => [l.url, l]));
    const touched = [];

    for (const [url, written] of normalized) {
        const found = byUrl.get(url);
        if (found) {
            if (
                type !== 'inbox_item' &&
                (found.source_type === 'inbox_item' || !found.source_type)
            ) {
                await found.update({ source_type: type, source_uid: uid });
            }
            touched.push(found);
            continue;
        }
        const note =
            type === 'inbox_item' && normalized.length === 1
                ? residualText(raw, written) || null
                : null;
        try {
            const link = await Link.create({
                user_id: userId,
                url,
                kind: classifyKind(url),
                note,
                source_type: type,
                source_uid: uid,
            });
            jobs.enqueueFetch(link.id);
            touched.push(link);
        } catch (error) {
            // Captured meanwhile by another write of the same text.
            if (!isUniqueViolation(error)) throw error;
        }
    }
    if (fresh && type === 'inbox_item' && normalized.length === 1) {
        const text = residualText(raw, normalized[0][1]);
        // Text an already saved link does not hold stays in the inbox: it would
        // be lost otherwise.
        const held = !text || touched[0]?.note === text;
        if (held && text.length <= SHARED_TEXT_MAX) {
            await settleInboxItem(userId, uid);
        }
    }
    return touched;
}

// A shared address is a link, not an idea to sort: it goes straight to the
// Links page. Only a new item moves, when it is little more than the address
// (a share often adds the page title): an idea that mentions a link stays.
async function settleInboxItem(userId, uid) {
    const { InboxItem } = require('../../models');
    await InboxItem.update(
        { status: 'processed' },
        { where: { user_id: userId, uid, status: 'added' } }
    );
}

function snapshot(model, row) {
    const source = SOURCES[model];
    return {
        userId: row.user_id,
        type: source.type,
        uid: row.uid,
        texts: source.fields.map((f) => row.get(f)),
    };
}

const BACKFILL_BATCH = 200;
// Ideas the user threw away: their links are not brought back.
const DISCARDED_INBOX = ['deleted', 'trashed'];

function existingRowsWhere(name, fields) {
    const conditions = [
        { [Op.or]: fields.map((f) => ({ [f]: ciLike('%http%') })) },
    ];
    if (name === 'Task') {
        conditions.push({
            [Op.or]: [{ habit_mode: false }, { habit_mode: null }],
        });
    }
    if (name === 'InboxItem') {
        conditions.push({ status: { [Op.notIn]: DISCARDED_INBOX } });
    }
    return { [Op.and]: conditions };
}

// Rows saved before links were captured (or while capture was off): their
// links are found as if the rows had just been written. Inbox items first,
// so a link later turned into a task or a note moves there as usual.
// Idempotent: a link already saved is only found again.
async function captureExisting() {
    const models = require('../../models');
    for (const [name, source] of Object.entries(SOURCES)) {
        const Model = models[name];
        if (!Model) continue;
        let lastId = 0;
        for (;;) {
            const rows = await Model.findAll({
                where: {
                    [Op.and]: [
                        { id: { [Op.gt]: lastId } },
                        existingRowsWhere(name, source.fields),
                    ],
                },
                attributes: ['id', 'uid', 'user_id', ...source.fields],
                order: [['id', 'ASC']],
                limit: BACKFILL_BATCH,
            });
            for (const row of rows) {
                if (row.user_id && row.uid) {
                    await captureFrom(snapshot(name, row));
                }
            }
            if (rows.length < BACKFILL_BATCH) break;
            lastId = rows[rows.length - 1].id;
        }
    }
}

function install(models) {
    for (const [name, source] of Object.entries(SOURCES)) {
        const Model = models[name];
        if (!Model) continue;
        const schedule = (row, options, fresh = false) => {
            if (!jobs.isEnabled() || !row.user_id || !row.uid) return;
            if (name === 'Task' && row.get('habit_mode')) return;
            const data = snapshot(name, row);
            jobs.afterWrite(options && options.transaction, () =>
                captureFrom(data, { fresh })
            );
        };
        Model.addHook('afterCreate', (row, options) =>
            schedule(row, options, true)
        );
        Model.addHook('afterUpdate', (row, options) => {
            if (source.fields.some((f) => row.changed(f))) {
                schedule(row, options);
            }
        });
    }
}

module.exports = { install, captureFrom, captureExisting, SOURCES };

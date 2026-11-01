'use strict';

const { Op } = require('sequelize');
const jobs = require('./jobs');
const {
    extractUrls,
    normalizeUrl,
    residualText,
    classifyKind,
} = require('./core/urls');

// At most this many links are taken from one row.
const MAX_PER_SOURCE = 20;

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
async function captureFrom({ userId, type, uid, texts }) {
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
    return touched;
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

function install(models) {
    for (const [name, source] of Object.entries(SOURCES)) {
        const Model = models[name];
        if (!Model) continue;
        const schedule = (row, options) => {
            if (!jobs.isEnabled() || !row.user_id || !row.uid) return;
            if (name === 'Task' && row.get('habit_mode')) return;
            const data = snapshot(name, row);
            jobs.afterWrite(options && options.transaction, () =>
                captureFrom(data)
            );
        };
        Model.addHook('afterCreate', schedule);
        Model.addHook('afterUpdate', (row, options) => {
            if (source.fields.some((f) => row.changed(f))) {
                schedule(row, options);
            }
        });
    }
}

module.exports = { install, captureFrom, SOURCES };

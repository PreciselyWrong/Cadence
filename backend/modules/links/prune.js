'use strict';

const { Op } = require('sequelize');
const { isContextUrl } = require('./core/urls');

// Hosts of this server's own sites and services, comma separated: like the
// built-in context addresses, they are never links.
function ignoredHosts() {
    return (process.env.TUDUDI_LINKS_IGNORE_HOSTS || '')
        .split(',')
        .map((h) =>
            h
                .trim()
                .toLowerCase()
                .replace(/^\*?\./, '')
        )
        .filter(Boolean);
}

// Done once per server: before 2026-11, every address written in a task or a
// note became a link, and so did context addresses (mail, chats, home server).
// Those the user never touched are deleted, through the model so devices
// receive the deletion, and excluded so a rescan does not bring them back.
const MARKER = 'links_context_pruned';
const BATCH = 200;

function untouched(link) {
    return (
        link.status === 'new' &&
        !link.note &&
        !link.project_id &&
        !link.review_at &&
        (link.Tags || []).length === 0
    );
}

async function pruneContextLinks() {
    const { Link, Setting, Tag } = require('../../models');
    const linksRepository = require('./repository');
    if (await Setting.findOne({ where: { key: MARKER } })) return 0;

    const hosts = ignoredHosts();
    let removed = 0;
    let lastId = 0;
    for (;;) {
        const rows = await Link.findAll({
            where: { id: { [Op.gt]: lastId }, status: 'new' },
            include: [
                { model: Tag, attributes: ['id'], through: { attributes: [] } },
            ],
            order: [['id', 'ASC']],
            limit: BATCH,
        });
        for (const link of rows) {
            const fromText = ['task', 'note'].includes(link.source_type);
            if (
                untouched(link) &&
                (fromText || isContextUrl(link.url, hosts))
            ) {
                await linksRepository.remove(link);
                removed += 1;
            }
        }
        if (rows.length < BATCH) break;
        lastId = rows[rows.length - 1].id;
    }
    await Setting.create({ key: MARKER, value: new Date().toISOString() });
    return removed;
}

module.exports = { pruneContextLinks };

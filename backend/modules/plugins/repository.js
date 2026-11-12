'use strict';

const { Plugin } = require('../../models');

function findAll() {
    return Plugin.findAll({ order: [['slug', 'ASC']] });
}

function findBySlug(slug) {
    return Plugin.findOne({ where: { slug } });
}

// Creates the row on first use. `patch` only holds the columns to change.
async function save(slug, patch) {
    const row = await findBySlug(slug);
    if (!row) return Plugin.create({ slug, ...patch });
    return row.update(patch);
}

async function saveStorage(slug, storage) {
    await Plugin.update({ storage }, { where: { slug } });
}

async function saveError(slug, message) {
    await Plugin.update({ last_error: message }, { where: { slug } });
}

async function remove(slug) {
    await Plugin.destroy({ where: { slug } });
}

module.exports = {
    remove,
    findAll,
    findBySlug,
    save,
    saveStorage,
    saveError,
};

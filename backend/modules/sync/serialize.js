'use strict';

const { ENTITIES } = require('./registry');

function plain(value) {
    return value instanceof Date ? value.toISOString() : (value ?? null);
}

async function uidOf(entity, id, transaction) {
    if (id === null || id === undefined) return null;
    const models = require('../../models');
    const target = await models[ENTITIES[entity].model].findByPk(id, {
        attributes: ['uid'],
        transaction,
    });
    return target ? target.uid : null;
}

// The wire shape of a row: synced fields, references by uid, and the field
// clocks so a client can merge exactly like the server does.
async function serializeRow(entity, row, transaction) {
    const def = ENTITIES[entity];
    const data = { uid: row.uid };
    for (const field of def.fields) {
        data[field] = plain(row.get(field));
    }
    for (const [key, ref] of Object.entries(def.refs)) {
        data[key] = await uidOf(ref.entity, row.get(ref.column), transaction);
    }
    data.field_clocks = row.get('field_clocks') ?? {};
    data.created_at = plain(row.get('created_at'));
    data.updated_at = plain(row.get('updated_at'));
    return data;
}

module.exports = { serializeRow };

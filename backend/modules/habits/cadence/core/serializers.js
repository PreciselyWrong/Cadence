'use strict';

const { ENTITIES } = require('../schema');

// The REST shape of a row is the sync shape (fields, references by uid,
// created_at and updated_at) without the merge clocks, so a web client and a
// device read the same names.

const plain = (value) =>
    value instanceof Date ? value.toISOString() : (value ?? null);

// `uidsById[entity]` maps numeric ids to uids for the referenced entities.
function serialize(entity, row, uidsById = {}) {
    const def = ENTITIES[entity];
    const data = { uid: row.uid };
    for (const name of Object.keys(def.columns)) {
        data[name] = plain(row.get(name));
    }
    for (const [key, ref] of Object.entries(def.refs)) {
        const id = row.get(ref.column);
        data[key] = id == null ? null : (uidsById[ref.entity]?.get(id) ?? null);
    }
    data.created_at = plain(row.get('created_at'));
    data.updated_at = plain(row.get('updated_at'));
    return data;
}

const idMap = (rows) => new Map(rows.map((r) => [r.id, r.uid]));

module.exports = { serialize, idMap };

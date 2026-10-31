'use strict';

const { ENTITIES } = require('./schema');
const { validate } = require('./validation');
const { destroyHabit, destroyGroup } = require('./operations/destroy');

// The sync registry entries of the Cadence habit entities, derived from
// schema.js so the wire fields, the models and the validation cannot drift.
function syncEntities() {
    const out = {};
    for (const [name, def] of Object.entries(ENTITIES)) {
        out[name] = {
            model: def.model,
            version: 1,
            fields: Object.keys(def.columns),
            refs: Object.fromEntries(
                Object.entries(def.refs).map(([key, ref]) => [
                    key,
                    { column: ref.column, entity: ref.entity },
                ])
            ),
            ...(def.uidScope ? { uidScope: def.uidScope } : {}),
            validate: (row, values, userId) =>
                validate(name, row, values, userId),
        };
    }
    out.habit.destroy = (row) => destroyHabit(row, row.user_id);
    out.habit_group.destroy = (row) => destroyGroup(row, row.user_id);
    return out;
}

module.exports = { syncEntities };

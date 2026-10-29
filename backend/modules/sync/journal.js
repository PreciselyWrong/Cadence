'use strict';

const { ENTITIES, entityForModel } = require('./registry');
const { serializeRow } = require('./serialize');
const hlc = require('./hlc');
const { currentOpId } = require('./context');

function syncedKeys(entity) {
    const def = ENTITIES[entity];
    return [...def.fields, ...Object.values(def.refs).map((r) => r.column)];
}

// A write that did not come through /sync/push still has to win over the
// older offline edits, so it stamps the fields it changes with the server
// clock. Pushed writes set their own clocks and pass `syncApplied`.
function stampClocks(entity, instance, options) {
    if (options && options.syncApplied) return;
    const changed = instance.isNewRecord
        ? syncedKeys(entity).filter((k) => instance.get(k) != null)
        : syncedKeys(entity).filter((k) => instance.changed(k));
    instance._syncChanged = instance.isNewRecord || changed.length > 0;
    if (changed.length === 0) return;
    const stamp = hlc.now();
    const clocks = { ...(instance.get('field_clocks') || {}) };
    for (const key of changed) {
        const field =
            Object.entries(ENTITIES[entity].refs).find(
                ([, ref]) => ref.column === key
            )?.[0] ?? key;
        clocks[field] = stamp;
    }
    instance.set('field_clocks', clocks);
}

function install(models) {
    const { SyncChange } = models;

    for (const Model of Object.values(models)) {
        const entity = entityForModel(Model.name);
        if (!entity) continue;

        // Bulk writes skip instance hooks unless asked; without them a
        // Task.update({...}, {where}) would never reach the devices.
        Model.addHook('beforeBulkCreate', (_rows, options) => {
            options.individualHooks = true;
        });
        Model.addHook('beforeBulkUpdate', (options) => {
            options.individualHooks = true;
        });
        Model.addHook('beforeBulkDestroy', (options) => {
            options.individualHooks = true;
        });

        Model.addHook('beforeCreate', (instance, options) => {
            stampClocks(entity, instance, options);
        });
        Model.addHook('beforeUpdate', (instance, options) => {
            stampClocks(entity, instance, options);
        });

        const record = async (instance, options) => {
            if (instance._syncChanged === false && !options.syncApplied) {
                return;
            }
            await SyncChange.create(
                {
                    user_id: instance.user_id,
                    entity,
                    uid: instance.uid,
                    op: 'upsert',
                    data: await serializeRow(
                        entity,
                        instance,
                        options.transaction
                    ),
                    op_id: currentOpId(),
                },
                { transaction: options.transaction }
            );
        };
        Model.addHook('afterCreate', record);
        Model.addHook('afterUpdate', record);

        Model.addHook('afterDestroy', async (instance, options) => {
            await SyncChange.create(
                {
                    user_id: instance.user_id,
                    entity,
                    uid: instance.uid,
                    op: 'delete',
                    data: { hlc: hlc.now() },
                    op_id: currentOpId(),
                },
                { transaction: options.transaction }
            );
        });
    }
}

module.exports = { install };

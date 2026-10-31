const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');
const { ENTITIES } = require('../modules/habits/cadence/schema');

// Cadence habit models, generated from the one description in
// modules/habits/cadence/schema.js. Every row carries a client-stable `uid`,
// the `user_id` that owns it and the `field_clocks` the sync merge needs.

function attribute(name, spec) {
    const options = { allowNull: !spec.required };
    if (spec.default !== undefined) options.defaultValue = spec.default;
    switch (spec.type) {
        case 'str':
            return { ...options, type: DataTypes.STRING(spec.len) };
        case 'enum':
            return { ...options, type: DataTypes.STRING(40) };
        case 'day':
            return { ...options, type: DataTypes.STRING(10) };
        case 'text':
            return { ...options, type: DataTypes.TEXT };
        case 'int':
            return { ...options, type: DataTypes.INTEGER };
        case 'bool':
            return { ...options, type: DataTypes.BOOLEAN };
        case 'ts':
            return { ...options, type: DataTypes.DATE };
        case 'big':
            return {
                ...options,
                type: DataTypes.BIGINT,
                // PostgreSQL returns BIGINT as a string; the API speaks numbers.
                get() {
                    const raw = this.getDataValue(name);
                    return raw === null || raw === undefined
                        ? raw
                        : Number(raw);
                },
            };
        default:
            throw new Error(`Unknown column kind ${spec.type} for ${name}`);
    }
}

function define(sequelize, def) {
    const attributes = {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        uid: {
            type: DataTypes.STRING(64),
            allowNull: false,
            // Unique per user for the default groups, whose ids are fixed
            // strings shared by every user; otherwise unique everywhere.
            unique: def.uidScope !== 'user',
            defaultValue: uid,
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
        },
        field_clocks: { type: DataTypes.JSON, allowNull: true },
    };
    const indexes = [{ fields: ['user_id'] }];
    if (def.uidScope === 'user') {
        indexes.push({
            name: `${def.table}_user_id_uid`,
            unique: true,
            fields: ['user_id', 'uid'],
        });
    }

    for (const ref of Object.values(def.refs)) {
        attributes[ref.column] = {
            type: DataTypes.INTEGER,
            allowNull: !ref.required,
            references: { model: ENTITIES[ref.entity].table, key: 'id' },
            onDelete: ref.onDelete,
        };
        // A unique index on the reference alone already serves lookups.
        if (def.unique?.join() !== ref.column) {
            indexes.push({ fields: [ref.column] });
        }
    }
    for (const [name, spec] of Object.entries(def.columns)) {
        attributes[name] = attribute(name, spec);
    }
    if (def.unique) {
        indexes.push({
            name: `${def.table}_${def.unique.join('_')}`,
            unique: true,
            fields: def.unique,
        });
    }
    if (def.index) {
        indexes.push({
            name: `${def.table}_${def.index.join('_')}`,
            fields: def.index,
        });
    }

    return sequelize.define(def.model, attributes, {
        tableName: def.table,
        indexes,
    });
}

module.exports = (sequelize) =>
    Object.fromEntries(
        Object.values(ENTITIES).map((def) => [
            def.model,
            define(sequelize, def),
        ])
    );

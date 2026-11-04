const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// What the user said about a task, an event or a recurring series. Lifetimes
// are applied when the brief reads them (modules/daily-plan/brief/contexts.js).
module.exports = (sequelize) => {
    const LinkedContext = sequelize.define(
        'LinkedContext',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                defaultValue: uid,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            // task | event | series
            scope: { type: DataTypes.STRING(8), allowNull: false },
            // Task uid, `event:` ref or `series:` ref (or a recurring task uid).
            target_ref: { type: DataTypes.STRING(255), allowNull: false },
            text: { type: DataTypes.STRING(500), allowNull: false },
        },
        {
            tableName: 'linked_contexts',
            indexes: [
                {
                    fields: ['user_id', 'scope', 'target_ref'],
                    name: 'linked_contexts_user_scope_target_idx',
                },
            ],
        }
    );

    return LinkedContext;
};

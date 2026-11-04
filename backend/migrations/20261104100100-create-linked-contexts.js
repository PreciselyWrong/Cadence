'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// What the user said about a task, an event or a recurring series, so that the
// engine stops asking the same question (docs/39-daily-brief.md, Memory).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'linked_contexts', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING, allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            scope: { type: Sequelize.STRING(8), allowNull: false },
            target_ref: { type: Sequelize.STRING(255), allowNull: false },
            text: { type: Sequelize.STRING(500), allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'linked_contexts',
            ['user_id', 'scope', 'target_ref'],
            { name: 'linked_contexts_user_scope_target_idx' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('linked_contexts');
    },
};

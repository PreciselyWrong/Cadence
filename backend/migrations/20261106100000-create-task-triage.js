'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Decisions and assistant proposals of the triage queue (docs/40-triage.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'task_triage', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            task_uid: { type: Sequelize.STRING, allowNull: false },
            fingerprint: { type: Sequelize.STRING(64), allowNull: false },
            state: { type: Sequelize.STRING(16), allowNull: false },
            proposal: { type: Sequelize.JSON, allowNull: true },
            apply_key: { type: Sequelize.STRING(150), allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'task_triage',
            ['user_id', 'task_uid'],
            {
                name: 'task_triage_user_task_unique',
                unique: true,
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('task_triage');
    },
};

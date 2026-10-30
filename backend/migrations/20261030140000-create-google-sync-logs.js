'use strict';

const { safeCreateTable, safeAddIndex } = require('../utils/migration-utils');

// Last Google sync entries per user: conflicts, errors and notable changes
// (fork, see docs/33-google-sync.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'google_sync_logs', {
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
            // info, conflict or error
            kind: { type: Sequelize.STRING, allowNull: false },
            message: { type: Sequelize.TEXT, allowNull: false },
            task_uid: { type: Sequelize.STRING, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeAddIndex(
            queryInterface,
            'google_sync_logs',
            ['user_id', 'created_at'],
            { name: 'google_sync_logs_user_created' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('google_sync_logs');
    },
};

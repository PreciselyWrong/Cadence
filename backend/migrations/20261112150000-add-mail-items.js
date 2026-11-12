'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Mail cards in the triage queue (docs/43-mail-triage.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'mail_items', {
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
            account: { type: Sequelize.STRING(64), allowNull: false },
            thread_id: { type: Sequelize.STRING(128), allowNull: false },
            from_name: { type: Sequelize.STRING(255), allowNull: true },
            from_address: { type: Sequelize.STRING(320), allowNull: true },
            subject: { type: Sequelize.STRING(500), allowNull: true },
            received_at: { type: Sequelize.DATE, allowNull: false },
            summary: { type: Sequelize.STRING(200), allowNull: false },
            suggestion: { type: Sequelize.JSON, allowNull: true },
            draft_excerpt: { type: Sequelize.STRING(280), allowNull: true },
            gmail_url: { type: Sequelize.STRING(2048), allowNull: false },
            status: { type: Sequelize.STRING(16), allowNull: false },
            later_until: { type: Sequelize.DATE, allowNull: true },
            decision: { type: Sequelize.STRING(16), allowNull: true },
            decided_at: { type: Sequelize.DATE, allowNull: true },
            decide_key: { type: Sequelize.STRING(150), allowNull: true },
            task_uid: { type: Sequelize.STRING, allowNull: true },
            archived_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'mail_items',
            ['user_id', 'account', 'thread_id'],
            { unique: true, name: 'mail_items_user_thread_unique' }
        );
        await safeEnsureIndex(
            queryInterface,
            'mail_items',
            ['user_id', 'status'],
            { name: 'mail_items_user_status_idx' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('mail_items');
    },
};

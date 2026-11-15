'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Per-user mail sender archive rules (docs/43-mail-triage.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'mail_sender_rules', {
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
            address: { type: Sequelize.STRING(254), allowNull: false },
            action: {
                type: Sequelize.STRING(16),
                allowNull: false,
                defaultValue: 'archive',
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'mail_sender_rules',
            ['user_id', 'address'],
            { unique: true, name: 'mail_sender_rules_user_address_unique' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('mail_sender_rules');
    },
};

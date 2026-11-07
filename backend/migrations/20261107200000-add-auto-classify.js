'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Automatic classification of new tasks, notes and links
// (docs/41-auto-classify.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        const id = {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        };
        const userId = {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
        };
        const timestamps = {
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        };

        await safeCreateTable(queryInterface, 'auto_classify_items', {
            id,
            user_id: userId,
            entity: { type: Sequelize.STRING(16), allowNull: false },
            item_uid: { type: Sequelize.STRING, allowNull: false },
            state: { type: Sequelize.STRING(16), allowNull: false },
            attempts: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            next_attempt_at: { type: Sequelize.DATE, allowNull: true },
            item_created_at: { type: Sequelize.DATE, allowNull: false },
            run_id: { type: Sequelize.STRING(40), allowNull: true },
            last_error: { type: Sequelize.STRING(255), allowNull: true },
            ...timestamps,
        });
        await safeEnsureIndex(
            queryInterface,
            'auto_classify_items',
            ['user_id', 'entity', 'item_uid'],
            { unique: true, name: 'auto_classify_items_user_item_unique' }
        );
        await safeEnsureIndex(
            queryInterface,
            'auto_classify_items',
            ['state', 'next_attempt_at'],
            { name: 'auto_classify_items_due_idx' }
        );

        await safeCreateTable(queryInterface, 'auto_classify_changes', {
            id,
            user_id: userId,
            run_id: { type: Sequelize.STRING(40), allowNull: false },
            entity: { type: Sequelize.STRING(16), allowNull: false },
            item_uid: { type: Sequelize.STRING, allowNull: false },
            item_title: { type: Sequelize.STRING(255), allowNull: true },
            before: { type: Sequelize.JSON, allowNull: false },
            after: { type: Sequelize.JSON, allowNull: false },
            confidences: { type: Sequelize.JSON, allowNull: true },
            asked: { type: Sequelize.JSON, allowNull: true },
            after_fingerprint: { type: Sequelize.STRING(64), allowNull: true },
            dry_run: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            undone_at: { type: Sequelize.DATE, allowNull: true },
            ...timestamps,
        });
        await safeEnsureIndex(
            queryInterface,
            'auto_classify_changes',
            ['user_id', 'run_id'],
            { name: 'auto_classify_changes_user_run_idx' }
        );
        await safeEnsureIndex(
            queryInterface,
            'auto_classify_changes',
            ['user_id', 'entity', 'item_uid'],
            { name: 'auto_classify_changes_user_item_idx' }
        );

        await safeCreateTable(queryInterface, 'auto_classify_suggestions', {
            id,
            uid: { type: Sequelize.STRING, allowNull: false, unique: true },
            user_id: userId,
            entity: { type: Sequelize.STRING(16), allowNull: false },
            item_uid: { type: Sequelize.STRING, allowNull: false },
            kind: { type: Sequelize.STRING(16), allowNull: false },
            payload: { type: Sequelize.JSON, allowNull: false },
            state: {
                type: Sequelize.STRING(16),
                allowNull: false,
                defaultValue: 'pending',
            },
            choice: { type: Sequelize.JSON, allowNull: true },
            run_id: { type: Sequelize.STRING(40), allowNull: true },
            expires_at: { type: Sequelize.DATE, allowNull: false },
            decided_at: { type: Sequelize.DATE, allowNull: true },
            ...timestamps,
        });
        await safeEnsureIndex(
            queryInterface,
            'auto_classify_suggestions',
            ['user_id', 'entity', 'item_uid'],
            {
                unique: true,
                name: 'auto_classify_suggestions_user_item_unique',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'auto_classify_suggestions',
            ['user_id', 'state'],
            { name: 'auto_classify_suggestions_user_state_idx' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('auto_classify_suggestions');
        await queryInterface.dropTable('auto_classify_changes');
        await queryInterface.dropTable('auto_classify_items');
    },
};

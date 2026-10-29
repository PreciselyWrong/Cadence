'use strict';

const {
    safeCreateTable,
    safeAddColumns,
    safeAddIndex,
} = require('../utils/migration-utils');

const SYNCED_TABLES = [
    'tasks',
    'projects',
    'areas',
    'tags',
    'notes',
    'inbox_items',
];

module.exports = {
    // Offline sync for the native clients: a change journal (the pull
    // cursor), pushed operations kept for idempotency, merge losers, and a
    // per-field clock on every synced table.
    async up(queryInterface, Sequelize) {
        const id = {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        };
        const userId = { type: Sequelize.INTEGER, allowNull: false };
        const createdAt = { type: Sequelize.DATE, allowNull: false };

        await safeCreateTable(queryInterface, 'sync_changes', {
            id,
            user_id: userId,
            entity: { type: Sequelize.STRING(40), allowNull: false },
            uid: { type: Sequelize.STRING(64), allowNull: false },
            op: { type: Sequelize.STRING(10), allowNull: false },
            data: { type: Sequelize.JSON, allowNull: true },
            op_id: { type: Sequelize.STRING(100), allowNull: true },
            scope_key: { type: Sequelize.STRING(80), allowNull: true },
            created_at: createdAt,
        });
        await safeAddIndex(queryInterface, 'sync_changes', ['user_id', 'id'], {
            name: 'sync_changes_user_id_id',
        });
        await safeAddIndex(
            queryInterface,
            'sync_changes',
            ['user_id', 'entity', 'uid'],
            { name: 'sync_changes_user_entity_uid' }
        );

        await safeCreateTable(queryInterface, 'sync_ops', {
            id,
            user_id: userId,
            op_id: { type: Sequelize.STRING(100), allowNull: false },
            result: { type: Sequelize.JSON, allowNull: false },
            created_at: createdAt,
        });
        await safeAddIndex(queryInterface, 'sync_ops', ['user_id', 'op_id'], {
            name: 'sync_ops_user_id_op_id',
            unique: true,
        });

        await safeCreateTable(queryInterface, 'sync_conflicts', {
            id,
            user_id: userId,
            entity: { type: Sequelize.STRING(40), allowNull: false },
            uid: { type: Sequelize.STRING(64), allowNull: false },
            field: { type: Sequelize.STRING(64), allowNull: false },
            losing_value: { type: Sequelize.JSON, allowNull: true },
            losing_hlc: { type: Sequelize.STRING(100), allowNull: false },
            winning_hlc: { type: Sequelize.STRING(100), allowNull: false },
            op_id: { type: Sequelize.STRING(100), allowNull: true },
            created_at: createdAt,
        });
        await safeAddIndex(
            queryInterface,
            'sync_conflicts',
            ['user_id', 'created_at'],
            { name: 'sync_conflicts_user_id_created_at' }
        );

        for (const table of SYNCED_TABLES) {
            await safeAddColumns(queryInterface, table, [
                {
                    name: 'field_clocks',
                    definition: { type: Sequelize.JSON, allowNull: true },
                },
            ]);
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable('sync_conflicts');
        await queryInterface.dropTable('sync_ops');
        await queryInterface.dropTable('sync_changes');
        for (const table of SYNCED_TABLES) {
            await queryInterface.removeColumn(table, 'field_clocks');
        }
    },
};

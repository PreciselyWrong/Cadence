'use strict';

const { safeCreateTable, safeAddColumns } = require('../utils/migration-utils');

// Offline sync for habits (fork feature, see docs/21-habits.md#offline-sync):
// check-ins get a client-chosen uid and an updated_at for updated_since, and
// idempotency_keys remembers the response to a write for 24 hours.
async function addIndex(queryInterface, table, fields, options) {
    try {
        await queryInterface.addIndex(table, fields, options);
    } catch (error) {
        // Already there on a re-run.
        if (!/already exists/i.test(error.message)) throw error;
    }
}

module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'recurring_completions', [
            {
                name: 'uid',
                definition: { type: Sequelize.STRING, allowNull: true },
            },
            {
                name: 'updated_at',
                definition: { type: Sequelize.DATE, allowNull: true },
            },
        ]);
        await addIndex(queryInterface, 'recurring_completions', ['uid'], {
            unique: true,
            name: 'recurring_completions_uid',
        });
        // Rows written before this change count as last changed when they
        // were logged.
        await queryInterface.sequelize.query(
            'UPDATE recurring_completions SET updated_at = completed_at WHERE updated_at IS NULL'
        );
        await safeCreateTable(queryInterface, 'idempotency_keys', {
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
            key: { type: Sequelize.STRING(255), allowNull: false },
            method: { type: Sequelize.STRING(10), allowNull: false },
            path: { type: Sequelize.STRING(512), allowNull: false },
            request_hash: { type: Sequelize.STRING(64), allowNull: false },
            // Null while the first request is still running.
            status: { type: Sequelize.INTEGER, allowNull: true },
            body: { type: Sequelize.TEXT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
        });
        await addIndex(queryInterface, 'idempotency_keys', ['user_id', 'key'], {
            unique: true,
            name: 'idempotency_keys_user_key',
        });
        await addIndex(queryInterface, 'idempotency_keys', ['created_at'], {
            name: 'idempotency_keys_created_at',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('idempotency_keys');
        await queryInterface.removeIndex(
            'recurring_completions',
            'recurring_completions_uid'
        );
        await queryInterface.removeColumn(
            'recurring_completions',
            'updated_at'
        );
        await queryInterface.removeColumn('recurring_completions', 'uid');
    },
};

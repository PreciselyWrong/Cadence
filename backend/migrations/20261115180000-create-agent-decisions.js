'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Agent decision cards (docs/49-agent-decisions.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'agent_decisions', {
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
            kind: { type: Sequelize.STRING(32), allowNull: false },
            kind_label: { type: Sequelize.STRING(40), allowNull: false },
            key: { type: Sequelize.STRING(128), allowNull: false },
            title: { type: Sequelize.STRING(120), allowNull: false },
            context: { type: Sequelize.STRING(280), allowNull: true },
            body: { type: Sequelize.TEXT, allowNull: true },
            url: { type: Sequelize.STRING(2000), allowNull: true },
            choices: { type: Sequelize.JSON, allowNull: false },
            recommended: { type: Sequelize.STRING(24), allowNull: true },
            reason: { type: Sequelize.STRING(140), allowNull: true },
            data: { type: Sequelize.JSON, allowNull: true },
            status: { type: Sequelize.STRING(16), allowNull: false },
            decision: { type: Sequelize.STRING(24), allowNull: true },
            note: { type: Sequelize.JSON, allowNull: true },
            later_until: { type: Sequelize.DATE, allowNull: true },
            decided_at: { type: Sequelize.DATE, allowNull: true },
            decide_key: { type: Sequelize.STRING(150), allowNull: true },
            result: { type: Sequelize.JSON, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'agent_decisions',
            ['user_id', 'kind', 'key'],
            { unique: true, name: 'agent_decisions_user_kind_key_unique' }
        );
        await safeEnsureIndex(
            queryInterface,
            'agent_decisions',
            ['user_id', 'status'],
            { name: 'agent_decisions_user_status_idx' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('agent_decisions');
    },
};

'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Proposals shown by the daily brief and the user's answers to them
// (docs/39-daily-brief.md, Memory). Read by the engine to refuse, ignore and
// silence; purged after settings.retention.decisionsDays.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'brief_proposals', {
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
            brief_date: { type: Sequelize.DATEONLY, allowNull: false },
            kind: { type: Sequelize.STRING(16), allowNull: false },
            target_type: { type: Sequelize.STRING(16), allowNull: false },
            target_ref: { type: Sequelize.STRING(255), allowNull: false },
            proposal: { type: Sequelize.JSON, allowNull: true },
            fingerprint: { type: Sequelize.STRING(255), allowNull: true },
            decision: {
                type: Sequelize.STRING(16),
                allowNull: false,
                defaultValue: 'pending',
            },
            reason: { type: Sequelize.TEXT, allowNull: true },
            rule: { type: Sequelize.STRING(100), allowNull: true },
            agent: { type: Sequelize.STRING(40), allowNull: true },
            run_id: { type: Sequelize.STRING(100), allowNull: true },
            execution_status: { type: Sequelize.STRING(16), allowNull: true },
            execution_ref: { type: Sequelize.STRING(255), allowNull: true },
            idempotency_key: {
                type: Sequelize.STRING(150),
                allowNull: true,
                unique: true,
            },
            decided_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'brief_proposals',
            ['user_id', 'brief_date'],
            { name: 'brief_proposals_user_date_idx' }
        );
        await safeEnsureIndex(
            queryInterface,
            'brief_proposals',
            ['user_id', 'kind', 'target_ref'],
            { name: 'brief_proposals_user_kind_target_idx' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('brief_proposals');
    },
};

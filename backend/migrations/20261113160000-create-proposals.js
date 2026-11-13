'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Agent proposals (docs/47-proposals.md): a week to plan or a review to do,
// judged by an agent and applied by the user.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'proposals', {
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
            kind: { type: Sequelize.STRING(16), allowNull: false },
            status: { type: Sequelize.STRING(16), allowNull: false },
            period_start: { type: Sequelize.DATEONLY, allowNull: true },
            period_end: { type: Sequelize.DATEONLY, allowNull: true },
            facts: { type: Sequelize.JSON, allowNull: false },
            answer: { type: Sequelize.JSON, allowNull: true },
            error: { type: Sequelize.STRING(64), allowNull: true },
            reply_text: { type: Sequelize.TEXT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'proposals',
            ['user_id', 'kind'],
            {
                name: 'proposals_user_kind_idx',
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('proposals');
    },
};

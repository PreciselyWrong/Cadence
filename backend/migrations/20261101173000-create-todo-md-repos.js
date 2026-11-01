'use strict';

const { safeCreateTable } = require('../utils/migration-utils');

// Sync state of the git repositories whose TODO.md is mirrored as a project
// (docs/35-todo-md-projects.md). Purely additive.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'todo_md_repos', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            slug: {
                type: Sequelize.STRING(64),
                allowNull: false,
                unique: true,
            },
            head_sha: { type: Sequelize.STRING(64), allowNull: true },
            synced_at: { type: Sequelize.DATE, allowNull: true },
            last_error: { type: Sequelize.TEXT, allowNull: true },
            pending: { type: Sequelize.JSON, allowNull: true },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('todo_md_repos');
    },
};

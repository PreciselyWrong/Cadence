'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Previews kept by address for tasks, notes and project pages
// (docs/37-links.md, Previews).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'link_previews', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            url: { type: Sequelize.STRING(2048), allowNull: false },
            title: { type: Sequelize.TEXT, allowNull: true },
            description: { type: Sequelize.TEXT, allowNull: true },
            image_url: { type: Sequelize.TEXT, allowNull: true },
            site_name: { type: Sequelize.STRING, allowNull: true },
            kind: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'other',
            },
            github_stars: { type: Sequelize.INTEGER, allowNull: true },
            github_language: { type: Sequelize.STRING, allowNull: true },
            github_last_commit: { type: Sequelize.DATE, allowNull: true },
            readme_excerpt: { type: Sequelize.TEXT, allowNull: true },
            fetch_status: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'done',
            },
            fetched_at: { type: Sequelize.DATE, allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(queryInterface, 'link_previews', ['url'], {
            unique: true,
            name: 'link_previews_url_unique',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('link_previews');
    },
};

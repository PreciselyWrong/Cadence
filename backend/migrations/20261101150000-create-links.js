'use strict';

const { safeCreateTable, safeAddIndex } = require('../utils/migration-utils');

module.exports = {
    // Links found in inbox items, tasks and notes, with their fetched
    // metadata, the user's note, status and tags (docs/37-links.md).
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'links', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING, allowNull: false, unique: true },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
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
            note: { type: Sequelize.TEXT, allowNull: true },
            status: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'new',
            },
            source_type: { type: Sequelize.STRING, allowNull: true },
            source_uid: { type: Sequelize.STRING, allowNull: true },
            fetch_status: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'pending',
            },
            fetched_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeAddIndex(queryInterface, 'links', ['user_id', 'url'], {
            unique: true,
            name: 'links_user_url_unique',
        });
        await safeAddIndex(queryInterface, 'links', ['fetch_status'], {
            name: 'links_fetch_status_idx',
        });

        await safeCreateTable(queryInterface, 'links_tags', {
            link_id: {
                type: Sequelize.INTEGER,
                references: { model: 'links', key: 'id' },
                onDelete: 'CASCADE',
            },
            tag_id: {
                type: Sequelize.INTEGER,
                references: { model: 'tags', key: 'id' },
                onDelete: 'CASCADE',
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });
        await safeAddIndex(
            queryInterface,
            'links_tags',
            ['link_id', 'tag_id'],
            { unique: true, name: 'links_tags_unique_idx' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('links_tags');
        await queryInterface.dropTable('links');
    },
};

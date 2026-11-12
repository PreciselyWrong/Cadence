const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A page of a project (modules/links, docs/37-links.md). The metadata is
// read by the server; the user owns the title once given, the address, the
// short note and the project.
module.exports = (sequelize) => {
    const Link = sequelize.define(
        'Link',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                defaultValue: uid,
            },
            // Offline sync: the hybrid logical clock of each field's last
            // write, used to merge edits field by field.
            field_clocks: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
            },
            // Normalized (modules/links/core/urls.normalizeUrl): one row per
            // page and user.
            url: {
                type: DataTypes.STRING(2048),
                allowNull: false,
            },
            title: { type: DataTypes.TEXT, allowNull: true },
            description: { type: DataTypes.TEXT, allowNull: true },
            image_url: { type: DataTypes.TEXT, allowNull: true },
            site_name: { type: DataTypes.STRING, allowNull: true },
            // repo | article | video | tool | other
            kind: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'other',
            },
            github_stars: { type: DataTypes.INTEGER, allowNull: true },
            github_language: { type: DataTypes.STRING, allowNull: true },
            github_last_commit: { type: DataTypes.DATE, allowNull: true },
            readme_excerpt: { type: DataTypes.TEXT, allowNull: true },
            note: { type: DataTypes.TEXT, allowNull: true },
            // Required by every write path (REST, sync, MCP); the column
            // stays nullable for rows older than the takeover migration.
            project_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'projects', key: 'id' },
                onDelete: 'CASCADE',
            },
            // pending | done | failed
            fetch_status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'pending',
            },
            fetched_at: { type: DataTypes.DATE, allowNull: true },
            // The former library's columns: no longer read or written, kept
            // because published migrations (links-two-statuses, the takeover)
            // run on databases made from these models (docs/37-links.md).
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'new',
            },
            review_at: { type: DataTypes.DATEONLY, allowNull: true },
            source_type: { type: DataTypes.STRING, allowNull: true },
            source_uid: { type: DataTypes.STRING, allowNull: true },
        },
        {
            tableName: 'links',
            indexes: [
                // A page is in a project once (docs/37-links.md).
                {
                    fields: ['project_id', 'url'],
                    unique: true,
                    name: 'links_project_url_unique',
                },
                { fields: ['user_id', 'url'], name: 'links_user_url_idx' },
                { fields: ['fetch_status'], name: 'links_fetch_status_idx' },
            ],
        }
    );

    return Link;
};

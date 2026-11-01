const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A link found in an inbox item, a task or a note (modules/links). The
// metadata is fetched by the server; the user owns the note, the status and
// the tags.
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
            // new | kept | tested | parked | dropped
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'new',
            },
            // Where the link was found: inbox_item | task | note, by uid.
            source_type: { type: DataTypes.STRING, allowNull: true },
            source_uid: { type: DataTypes.STRING, allowNull: true },
            // pending | done | failed
            fetch_status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'pending',
            },
            fetched_at: { type: DataTypes.DATE, allowNull: true },
            // Local day to look at a parked link again; never a due date.
            review_at: { type: DataTypes.DATEONLY, allowNull: true },
        },
        {
            tableName: 'links',
            indexes: [
                {
                    fields: ['user_id', 'url'],
                    unique: true,
                    name: 'links_user_url_unique',
                },
                { fields: ['fetch_status'], name: 'links_fetch_status_idx' },
            ],
        }
    );

    return Link;
};

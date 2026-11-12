const { DataTypes } = require('sequelize');

// What a web page says about itself, read once by the server and kept by
// normalized address for every task, note and project page that shows it
// (modules/links/previews.js). Public page metadata only: no user data.
module.exports = (sequelize) =>
    sequelize.define(
        'LinkPreview',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            url: { type: DataTypes.STRING(2048), allowNull: false },
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
            // done | failed
            fetch_status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'done',
            },
            fetched_at: { type: DataTypes.DATE, allowNull: false },
        },
        {
            tableName: 'link_previews',
            indexes: [
                {
                    fields: ['url'],
                    unique: true,
                    name: 'link_previews_url_unique',
                },
            ],
        }
    );

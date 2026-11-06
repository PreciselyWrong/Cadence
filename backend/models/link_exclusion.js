const { DataTypes } = require('sequelize');

// A page the user deleted from their links, or moved away from: finding its
// address again in a task or a note must not bring the link back. Saving it on
// purpose lifts the exclusion (docs/37-links.md).
module.exports = (sequelize) =>
    sequelize.define(
        'LinkExclusion',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            url: { type: DataTypes.STRING(2048), allowNull: false },
        },
        {
            tableName: 'link_exclusions',
            indexes: [
                {
                    fields: ['user_id', 'url'],
                    unique: true,
                    name: 'link_exclusions_user_url_unique',
                },
            ],
        }
    );

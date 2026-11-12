const { DataTypes } = require('sequelize');

// What the instance remembers about a plugin found in TUDUDI_PLUGINS_DIR
// (docs/46-plugins.md). The code and manifest stay on disk; this row holds
// the admin's choices. `settings` keeps secret fields encrypted with
// secretCipher ("enc:v1:..."); `grant` is the permissions and events the
// admin approved by turning the plugin on.
module.exports = (sequelize) => {
    const Plugin = sequelize.define(
        'Plugin',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            slug: {
                type: DataTypes.STRING(32),
                allowNull: false,
                unique: true,
            },
            enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            settings: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
            },
            storage: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
            },
            grant: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            version_seen: {
                type: DataTypes.STRING(32),
                allowNull: true,
            },
            previous_version: {
                type: DataTypes.STRING(32),
                allowNull: true,
            },
            last_error: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            update_check: {
                type: DataTypes.JSON,
                allowNull: true,
            },
        },
        {
            tableName: 'plugins',
            underscored: true,
            timestamps: true,
        }
    );

    return Plugin;
};

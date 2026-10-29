const { DataTypes } = require('sequelize');

// Google Calendar / Google Tasks sync (fork, see docs/33-google-sync.md).
module.exports = (sequelize) => {
    const GoogleTasklist = sequelize.define(
        'GoogleTasklist',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            google_id: { type: DataTypes.STRING, allowNull: false },
            title: { type: DataTypes.STRING, allowNull: false },
            // Null for the default list, which holds tasks without a project.
            project_id: { type: DataTypes.INTEGER, allowNull: true },
            is_default: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            tableName: 'google_tasklists',
            indexes: [
                {
                    fields: ['user_id', 'google_id'],
                    unique: true,
                    name: 'google_tasklists_user_google_id',
                },
            ],
        }
    );

    return GoogleTasklist;
};

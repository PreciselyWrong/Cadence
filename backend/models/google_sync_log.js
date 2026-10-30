const { DataTypes } = require('sequelize');

// Google Calendar / Google Tasks sync (fork, see docs/33-google-sync.md):
// the last entries of each user's sync log.
module.exports = (sequelize) => {
    const GoogleSyncLog = sequelize.define(
        'GoogleSyncLog',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            kind: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: { isIn: [['info', 'conflict', 'error']] },
            },
            message: { type: DataTypes.TEXT, allowNull: false },
            task_uid: { type: DataTypes.STRING, allowNull: true },
        },
        {
            tableName: 'google_sync_logs',
            indexes: [
                {
                    fields: ['user_id', 'created_at'],
                    name: 'google_sync_logs_user_created',
                },
            ],
        }
    );

    return GoogleSyncLog;
};

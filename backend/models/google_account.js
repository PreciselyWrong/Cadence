const { DataTypes } = require('sequelize');

// Google Calendar / Google Tasks sync (fork, see docs/33-google-sync.md).
module.exports = (sequelize) => {
    const GoogleAccount = sequelize.define(
        'GoogleAccount',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                unique: true,
            },
            email: { type: DataTypes.STRING, allowNull: true },
            // OAuth tokens grant access to the user's Google data, so both
            // are encrypted at rest and never returned by the API.
            refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: false },
            access_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
            access_token_expires_at: { type: DataTypes.DATE, allowNull: true },
            // The secondary "Tududi" calendar that holds dated tasks.
            tududi_calendar_id: { type: DataTypes.STRING, allowNull: true },
            // Google id of the calendar that receives the tasks instead of
            // the "Cadence" one; empty means the "Cadence" calendar.
            task_calendar_id: { type: DataTypes.STRING, allowNull: true },
            sync_events: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            sync_tasks: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            // Google Tasks has no sync token: the next pull asks for items
            // updated since this instant.
            tasks_updated_min: { type: DataTypes.DATE, allowNull: true },
            last_synced_at: { type: DataTypes.DATE, allowNull: true },
            last_error: { type: DataTypes.TEXT, allowNull: true },
        },
        {
            tableName: 'google_accounts',
            indexes: [
                {
                    fields: ['user_id'],
                    unique: true,
                    name: 'google_accounts_user_id_unique',
                },
            ],
        }
    );

    return GoogleAccount;
};

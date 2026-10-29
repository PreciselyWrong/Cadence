const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// Google Calendar / Google Tasks sync (fork, see docs/32-google-sync.md).
module.exports = (sequelize) => {
    const GoogleCalendar = sequelize.define(
        'GoogleCalendar',
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
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            google_id: { type: DataTypes.STRING, allowNull: false },
            summary: { type: DataTypes.STRING, allowNull: false },
            color: { type: DataTypes.STRING, allowNull: true },
            // owner, writer, reader or freeBusyReader
            access_role: { type: DataTypes.STRING, allowNull: false },
            is_primary: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            is_tududi: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            show_on_calendar: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            sync_token: { type: DataTypes.TEXT, allowNull: true },
        },
        {
            tableName: 'google_calendars',
            indexes: [
                {
                    fields: ['user_id', 'google_id'],
                    unique: true,
                    name: 'google_calendars_user_google_id',
                },
            ],
        }
    );

    return GoogleCalendar;
};

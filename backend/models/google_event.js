const { DataTypes } = require('sequelize');

// Google Calendar / Google Tasks sync (fork, see docs/33-google-sync.md).
module.exports = (sequelize) => {
    const GoogleEvent = sequelize.define(
        'GoogleEvent',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            google_calendar_id: { type: DataTypes.INTEGER, allowNull: false },
            event_id: { type: DataTypes.STRING, allowNull: false },
            etag: { type: DataTypes.STRING, allowNull: true },
            summary: { type: DataTypes.TEXT, allowNull: true },
            description: { type: DataTypes.TEXT, allowNull: true },
            location: { type: DataTypes.TEXT, allowNull: true },
            all_day: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            // Timed events: instants. All-day events: start_date and the
            // exclusive end_date, as YYYY-MM-DD.
            start_at: { type: DataTypes.DATE, allowNull: true },
            end_at: { type: DataTypes.DATE, allowNull: true },
            start_date: { type: DataTypes.STRING(10), allowNull: true },
            end_date: { type: DataTypes.STRING(10), allowNull: true },
            busy: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            recurring_event_id: { type: DataTypes.STRING, allowNull: true },
            html_link: { type: DataTypes.TEXT, allowNull: true },
        },
        {
            tableName: 'google_events',
            indexes: [
                {
                    fields: ['google_calendar_id', 'event_id'],
                    unique: true,
                    name: 'google_events_calendar_event',
                },
                {
                    fields: ['user_id', 'start_at'],
                    name: 'google_events_user_start_at',
                },
                {
                    fields: ['user_id', 'start_date'],
                    name: 'google_events_user_start_date',
                },
            ],
        }
    );

    return GoogleEvent;
};

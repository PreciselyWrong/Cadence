const { DataTypes } = require('sequelize');

// Google Calendar / Google Tasks sync (fork, see docs/32-google-sync.md).
module.exports = (sequelize) => {
    const GoogleTaskLink = sequelize.define(
        'GoogleTaskLink',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: { type: DataTypes.INTEGER, allowNull: false },
            // No foreign key: a link whose task is gone tells the next sync
            // to delete the Google copy.
            task_id: { type: DataTypes.INTEGER, allowNull: false },
            // 'event' (the Tududi calendar) or 'task' (Google Tasks)
            kind: { type: DataTypes.STRING(10), allowNull: false },
            // Calendar id or task list id holding the Google copy.
            container_id: { type: DataTypes.STRING, allowNull: false },
            google_id: { type: DataTypes.STRING, allowNull: false },
            // Hashes of the synced fields on each side at the last sync; a
            // side whose hash moved has changed since.
            local_hash: { type: DataTypes.STRING(64), allowNull: true },
            remote_hash: { type: DataTypes.STRING(64), allowNull: true },
        },
        {
            tableName: 'google_task_links',
            indexes: [
                {
                    fields: ['user_id', 'kind', 'task_id'],
                    unique: true,
                    name: 'google_task_links_user_kind_task',
                },
                {
                    fields: ['user_id', 'kind', 'google_id'],
                    name: 'google_task_links_user_kind_google',
                },
            ],
        }
    );

    return GoogleTaskLink;
};

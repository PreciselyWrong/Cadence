const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A finished focus (Pomodoro) session, optionally about one task.
module.exports = (sequelize) => {
    const FocusSession = sequelize.define(
        'FocusSession',
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
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            task_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: { model: 'tasks', key: 'id' },
                onDelete: 'SET NULL',
            },
            started_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            ended_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            // Time actually focused, pauses left out.
            duration_seconds: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
        },
        {
            tableName: 'focus_sessions',
            indexes: [
                {
                    fields: ['user_id', 'started_at'],
                    name: 'focus_sessions_user_started',
                },
            ],
        }
    );

    return FocusSession;
};

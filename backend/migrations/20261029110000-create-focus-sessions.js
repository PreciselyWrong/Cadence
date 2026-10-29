'use strict';

const { safeCreateTable, safeAddIndex } = require('../utils/migration-utils');

module.exports = {
    // Finished focus (Pomodoro) sessions, shown on the calendar and in the
    // focus statistics.
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'focus_sessions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            task_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'tasks', key: 'id' },
                onDelete: 'SET NULL',
            },
            started_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            ended_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            duration_seconds: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });
        await safeAddIndex(
            queryInterface,
            'focus_sessions',
            ['user_id', 'started_at'],
            {
                name: 'focus_sessions_user_started',
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('focus_sessions');
    },
};

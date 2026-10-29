'use strict';

const { safeCreateTable } = require('../utils/migration-utils');

// Two-way sync with Google Calendar and Google Tasks (fork feature, see
// docs/33-google-sync.md).
async function addIndex(queryInterface, table, fields, options) {
    try {
        await queryInterface.addIndex(table, fields, options);
    } catch (error) {
        // Already there on a re-run.
        if (!/already exists/i.test(error.message)) throw error;
    }
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const timestamps = {
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        };
        const userId = {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
        };

        await safeCreateTable(queryInterface, 'google_accounts', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: { ...userId, unique: true },
            email: { type: Sequelize.STRING, allowNull: true },
            refresh_token_encrypted: { type: Sequelize.TEXT, allowNull: false },
            access_token_encrypted: { type: Sequelize.TEXT, allowNull: true },
            access_token_expires_at: { type: Sequelize.DATE, allowNull: true },
            tududi_calendar_id: { type: Sequelize.STRING, allowNull: true },
            sync_events: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            sync_tasks: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            tasks_updated_min: { type: Sequelize.DATE, allowNull: true },
            last_synced_at: { type: Sequelize.DATE, allowNull: true },
            last_error: { type: Sequelize.TEXT, allowNull: true },
            ...timestamps,
        });

        await safeCreateTable(queryInterface, 'google_calendars', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING, allowNull: false, unique: true },
            user_id: userId,
            google_id: { type: Sequelize.STRING, allowNull: false },
            summary: { type: Sequelize.STRING, allowNull: false },
            color: { type: Sequelize.STRING, allowNull: true },
            access_role: { type: Sequelize.STRING, allowNull: false },
            is_primary: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            is_tududi: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            show_on_calendar: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            sync_token: { type: Sequelize.TEXT, allowNull: true },
            ...timestamps,
        });
        await addIndex(
            queryInterface,
            'google_calendars',
            ['user_id', 'google_id'],
            {
                unique: true,
                name: 'google_calendars_user_google_id',
            }
        );

        await safeCreateTable(queryInterface, 'google_events', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: userId,
            google_calendar_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'google_calendars', key: 'id' },
                onDelete: 'CASCADE',
            },
            event_id: { type: Sequelize.STRING, allowNull: false },
            etag: { type: Sequelize.STRING, allowNull: true },
            summary: { type: Sequelize.TEXT, allowNull: true },
            description: { type: Sequelize.TEXT, allowNull: true },
            location: { type: Sequelize.TEXT, allowNull: true },
            all_day: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            // Timed events: instants. All-day events: start_date and the
            // exclusive end_date, as YYYY-MM-DD.
            start_at: { type: Sequelize.DATE, allowNull: true },
            end_at: { type: Sequelize.DATE, allowNull: true },
            start_date: { type: Sequelize.STRING(10), allowNull: true },
            end_date: { type: Sequelize.STRING(10), allowNull: true },
            busy: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            recurring_event_id: { type: Sequelize.STRING, allowNull: true },
            html_link: { type: Sequelize.TEXT, allowNull: true },
            ...timestamps,
        });
        await addIndex(
            queryInterface,
            'google_events',
            ['google_calendar_id', 'event_id'],
            {
                unique: true,
                name: 'google_events_calendar_event',
            }
        );
        await addIndex(
            queryInterface,
            'google_events',
            ['user_id', 'start_at'],
            {
                name: 'google_events_user_start_at',
            }
        );
        await addIndex(
            queryInterface,
            'google_events',
            ['user_id', 'start_date'],
            {
                name: 'google_events_user_start_date',
            }
        );

        await safeCreateTable(queryInterface, 'google_tasklists', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: userId,
            google_id: { type: Sequelize.STRING, allowNull: false },
            title: { type: Sequelize.STRING, allowNull: false },
            // Null for the default list, which holds tasks without a project.
            project_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'projects', key: 'id' },
                onDelete: 'SET NULL',
            },
            is_default: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            ...timestamps,
        });
        await addIndex(
            queryInterface,
            'google_tasklists',
            ['user_id', 'google_id'],
            {
                unique: true,
                name: 'google_tasklists_user_google_id',
            }
        );

        await safeCreateTable(queryInterface, 'google_task_links', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: userId,
            // No foreign key: a link whose task is gone tells the next sync
            // to delete the Google copy.
            task_id: { type: Sequelize.INTEGER, allowNull: false },
            // 'event' (Tududi calendar) or 'task' (Google Tasks)
            kind: { type: Sequelize.STRING(10), allowNull: false },
            container_id: { type: Sequelize.STRING, allowNull: false },
            google_id: { type: Sequelize.STRING, allowNull: false },
            local_hash: { type: Sequelize.STRING(64), allowNull: true },
            remote_hash: { type: Sequelize.STRING(64), allowNull: true },
            ...timestamps,
        });
        await addIndex(
            queryInterface,
            'google_task_links',
            ['user_id', 'kind', 'task_id'],
            {
                unique: true,
                name: 'google_task_links_user_kind_task',
            }
        );
        await addIndex(
            queryInterface,
            'google_task_links',
            ['user_id', 'kind', 'google_id'],
            {
                name: 'google_task_links_user_kind_google',
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('google_task_links');
        await queryInterface.dropTable('google_tasklists');
        await queryInterface.dropTable('google_events');
        await queryInterface.dropTable('google_calendars');
        await queryInterface.dropTable('google_accounts');
    },
};

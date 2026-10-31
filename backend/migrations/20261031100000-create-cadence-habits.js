'use strict';

const {
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// Cadence habits, stored for sync with the Android app and shown on the web
// (docs/21-habits.md, "Cadence habits"). One table per Room entity of the
// app; every row has a client-stable uid, the owner, and the per-field
// clocks of the sync merge. Widget configuration and reminder snoozes stay
// on the device.
//
// This copy of the schema is frozen: later changes go in a new migration.
const TABLES = [
    'habit_groups',
    'habits',
    'habit_goal_versions',
    'habit_schedule_versions',
    'habit_entries',
    'habit_pauses',
    'habit_quick_values',
    'habit_reminders',
    'habit_timers',
    'health_connect_rules',
    'health_connect_imports',
    'abstinence_logs',
    'alcohol_consumptions',
    'learned_question_settings',
    'learned_question_records',
];

module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'habit_groups', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            name: { type: Sequelize.STRING(255), allowNull: false },
            start_minute: { type: Sequelize.INTEGER, allowNull: true },
            end_minute: { type: Sequelize.INTEGER, allowNull: true },
            sort_order: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habits', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            group_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'habit_groups', key: 'id' },
                onDelete: 'SET NULL',
            },
            name: { type: Sequelize.STRING(255), allowNull: false },
            description: { type: Sequelize.TEXT, allowNull: true },
            icon_id: { type: Sequelize.STRING(100), allowNull: true },
            color_argb: { type: Sequelize.INTEGER, allowNull: true },
            active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            starts_on: {
                type: Sequelize.STRING(10),
                allowNull: false,
                defaultValue: '1970-01-01',
            },
            archived: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            sort_order: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            client_created_at: { type: Sequelize.DATE, allowNull: true },
            timer_enabled: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            abstinence_profile: {
                type: Sequelize.STRING(40),
                allowNull: false,
                defaultValue: 'NONE',
            },
            abstinence_started_at: { type: Sequelize.DATE, allowNull: true },
            abstinence_spending_minor: {
                type: Sequelize.BIGINT,
                allowNull: true,
            },
            abstinence_spending_period: {
                type: Sequelize.STRING(40),
                allowNull: true,
            },
            abstinence_savings_currency: {
                type: Sequelize.STRING(16),
                allowNull: true,
            },
            alcohol_follow_up_time: {
                type: Sequelize.STRING(5),
                allowNull: true,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_goal_versions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            target_minor: { type: Sequelize.BIGINT, allowNull: false },
            period: { type: Sequelize.STRING(40), allowNull: false },
            goal_type: {
                type: Sequelize.STRING(40),
                allowNull: false,
                defaultValue: 'QUANTITY',
            },
            unit_id: { type: Sequelize.STRING(100), allowNull: true },
            unit_dimension: { type: Sequelize.STRING(40), allowNull: true },
            unit_name_fr: { type: Sequelize.STRING(100), allowNull: true },
            unit_symbol: { type: Sequelize.STRING(32), allowNull: true },
            unit_scale_to_canonical: {
                type: Sequelize.BIGINT,
                allowNull: true,
            },
            frequency_target: { type: Sequelize.INTEGER, allowNull: true },
            minimum_minor: { type: Sequelize.BIGINT, allowNull: true },
            direction: {
                type: Sequelize.STRING(40),
                allowNull: false,
                defaultValue: 'AT_LEAST',
            },
            progression_step: { type: Sequelize.BIGINT, allowNull: true },
            progression_cadence: {
                type: Sequelize.STRING(40),
                allowNull: true,
            },
            progression_cap_minor: { type: Sequelize.BIGINT, allowNull: true },
            progression_starts_on: {
                type: Sequelize.STRING(10),
                allowNull: true,
            },
            effective_from: { type: Sequelize.STRING(10), allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_schedule_versions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            schedule_mode: {
                type: Sequelize.STRING(40),
                allowNull: false,
                defaultValue: 'SELECTED_DAYS',
            },
            active_days: { type: Sequelize.STRING(100), allowNull: false },
            first_day_of_week: { type: Sequelize.STRING(40), allowNull: false },
            effective_from: { type: Sequelize.STRING(10), allowNull: false },
            interval_days: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 2,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_entries', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            occurred_at: { type: Sequelize.DATE, allowNull: false },
            local_date: { type: Sequelize.STRING(10), allowNull: false },
            observed_zone_id: { type: Sequelize.STRING(64), allowNull: false },
            value_minor: { type: Sequelize.BIGINT, allowNull: false },
            source: {
                type: Sequelize.STRING(255),
                allowNull: false,
                defaultValue: 'MANUAL',
            },
            session_id: { type: Sequelize.STRING(100), allowNull: true },
            note: { type: Sequelize.TEXT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_pauses', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            start: { type: Sequelize.STRING(10), allowNull: false },
            end_exclusive: { type: Sequelize.STRING(10), allowNull: true },
            reason: { type: Sequelize.STRING(40), allowNull: true },
            reason_label: { type: Sequelize.STRING(255), allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_quick_values', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            label: { type: Sequelize.STRING(100), allowNull: false },
            amount_minor: { type: Sequelize.BIGINT, allowNull: false },
            sort_order: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_reminders', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            time: { type: Sequelize.STRING(5), allowNull: false },
            days_of_week: {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: '',
            },
            enabled: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            conditional: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'habit_timers', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            accumulated_seconds: {
                type: Sequelize.BIGINT,
                allowNull: false,
                defaultValue: 0,
            },
            running_since: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'health_connect_rules', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            exercise_types: { type: Sequelize.TEXT, allowNull: false },
            data_origin_package: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            enabled: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'health_connect_imports', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            record_id: { type: Sequelize.STRING(255), allowNull: false },
            entry_uid: { type: Sequelize.STRING(100), allowNull: false },
            data_origin_package: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },
            state: { type: Sequelize.STRING(40), allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'abstinence_logs', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            occurred_at: { type: Sequelize.DATE, allowNull: false },
            local_date: { type: Sequelize.STRING(10), allowNull: false },
            observed_zone_id: { type: Sequelize.STRING(64), allowNull: false },
            kind: { type: Sequelize.STRING(40), allowNull: false },
            intensity: { type: Sequelize.INTEGER, allowNull: true },
            note: { type: Sequelize.TEXT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'alcohol_consumptions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            local_date: { type: Sequelize.STRING(10), allowNull: false },
            observed_zone_id: { type: Sequelize.STRING(64), allowNull: false },
            standard_drinks: { type: Sequelize.INTEGER, allowNull: true },
            follow_up_date: { type: Sequelize.STRING(10), allowNull: true },
            follow_up_notified: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            observed_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'learned_question_settings', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            enabled: { type: Sequelize.BOOLEAN, allowNull: false },
            ask_at: { type: Sequelize.STRING(5), allowNull: false },
            threshold_percent: { type: Sequelize.INTEGER, allowNull: false },
            muted_weekdays: {
                type: Sequelize.STRING(100),
                allowNull: false,
                defaultValue: '',
            },
            silent_during_pauses: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeCreateTable(queryInterface, 'learned_question_records', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            field_clocks: { type: Sequelize.JSON, allowNull: true },
            habit_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'habits', key: 'id' },
                onDelete: 'CASCADE',
            },
            local_date: { type: Sequelize.STRING(10), allowNull: false },
            outcome: { type: Sequelize.STRING(40), allowNull: false },
            value_minor: { type: Sequelize.BIGINT, allowNull: true },
            recorded_at: { type: Sequelize.DATE, allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await safeEnsureIndex(queryInterface, 'habit_groups', ['user_id'], {
            name: 'habit_groups_user_id',
        });
        await safeEnsureIndex(
            queryInterface,
            'habit_groups',
            ['user_id', 'uid'],
            {
                name: 'habit_groups_user_id_uid',
                unique: true,
            }
        );
        await safeEnsureIndex(queryInterface, 'habits', ['user_id'], {
            name: 'habits_user_id',
        });
        await safeEnsureIndex(queryInterface, 'habits', ['group_id'], {
            name: 'habits_group_id',
        });
        await safeEnsureIndex(
            queryInterface,
            'habit_goal_versions',
            ['user_id'],
            {
                name: 'habit_goal_versions_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'habit_goal_versions',
            ['habit_id'],
            {
                name: 'habit_goal_versions_habit_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'habit_schedule_versions',
            ['user_id'],
            {
                name: 'habit_schedule_versions_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'habit_schedule_versions',
            ['habit_id'],
            {
                name: 'habit_schedule_versions_habit_id',
            }
        );
        await safeEnsureIndex(queryInterface, 'habit_entries', ['user_id'], {
            name: 'habit_entries_user_id',
        });
        await safeEnsureIndex(queryInterface, 'habit_entries', ['habit_id'], {
            name: 'habit_entries_habit_id',
        });
        await safeEnsureIndex(
            queryInterface,
            'habit_entries',
            ['habit_id', 'local_date'],
            {
                name: 'habit_entries_habit_id_local_date',
            }
        );
        await safeEnsureIndex(queryInterface, 'habit_pauses', ['user_id'], {
            name: 'habit_pauses_user_id',
        });
        await safeEnsureIndex(queryInterface, 'habit_pauses', ['habit_id'], {
            name: 'habit_pauses_habit_id',
        });
        await safeEnsureIndex(
            queryInterface,
            'habit_quick_values',
            ['user_id'],
            {
                name: 'habit_quick_values_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'habit_quick_values',
            ['habit_id'],
            {
                name: 'habit_quick_values_habit_id',
            }
        );
        await safeEnsureIndex(queryInterface, 'habit_reminders', ['user_id'], {
            name: 'habit_reminders_user_id',
        });
        await safeEnsureIndex(queryInterface, 'habit_reminders', ['habit_id'], {
            name: 'habit_reminders_habit_id',
        });
        await safeEnsureIndex(queryInterface, 'habit_timers', ['user_id'], {
            name: 'habit_timers_user_id',
        });
        await safeEnsureIndex(queryInterface, 'habit_timers', ['habit_id'], {
            name: 'habit_timers_habit_id',
            unique: true,
        });
        await safeEnsureIndex(
            queryInterface,
            'health_connect_rules',
            ['user_id'],
            {
                name: 'health_connect_rules_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'health_connect_rules',
            ['habit_id'],
            {
                name: 'health_connect_rules_habit_id',
                unique: true,
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'health_connect_imports',
            ['user_id'],
            {
                name: 'health_connect_imports_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'health_connect_imports',
            ['habit_id'],
            {
                name: 'health_connect_imports_habit_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'health_connect_imports',
            ['habit_id', 'record_id'],
            {
                name: 'health_connect_imports_habit_id_record_id',
                unique: true,
            }
        );
        await safeEnsureIndex(queryInterface, 'abstinence_logs', ['user_id'], {
            name: 'abstinence_logs_user_id',
        });
        await safeEnsureIndex(queryInterface, 'abstinence_logs', ['habit_id'], {
            name: 'abstinence_logs_habit_id',
        });
        await safeEnsureIndex(
            queryInterface,
            'abstinence_logs',
            ['habit_id', 'local_date'],
            {
                name: 'abstinence_logs_habit_id_local_date',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'alcohol_consumptions',
            ['user_id'],
            {
                name: 'alcohol_consumptions_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'alcohol_consumptions',
            ['habit_id'],
            {
                name: 'alcohol_consumptions_habit_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'alcohol_consumptions',
            ['habit_id', 'local_date'],
            {
                name: 'alcohol_consumptions_habit_id_local_date',
                unique: true,
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'learned_question_settings',
            ['user_id'],
            {
                name: 'learned_question_settings_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'learned_question_settings',
            ['habit_id'],
            {
                name: 'learned_question_settings_habit_id',
                unique: true,
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'learned_question_records',
            ['user_id'],
            {
                name: 'learned_question_records_user_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'learned_question_records',
            ['habit_id'],
            {
                name: 'learned_question_records_habit_id',
            }
        );
        await safeEnsureIndex(
            queryInterface,
            'learned_question_records',
            ['habit_id', 'local_date'],
            {
                name: 'learned_question_records_habit_id_local_date',
                unique: true,
            }
        );
    },

    async down(queryInterface) {
        for (const table of [...TABLES].reverse()) {
            await queryInterface.dropTable(table);
        }
    },
};

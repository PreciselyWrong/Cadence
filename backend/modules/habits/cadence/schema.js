'use strict';

// One authoritative description of the Cadence habit entities stored on the
// server. It drives the Sequelize models (backend/models/cadence_habits.js),
// the sync registry entries and the validation of every write. Wire names are
// the snake_case of the Room properties of android/data (Room `habitId`
// becomes the reference `habit_uid`). The migration that creates the tables
// keeps its own frozen copy: migrations never read this file.
//
// Column kinds:
//   str   STRING(len)            text  TEXT
//   int   INTEGER                big   BIGINT, read back as a JS number
//   bool  BOOLEAN                ts    an instant (ISO 8601 UTC on the wire)
//   day   'YYYY-MM-DD' civil date
//   enum  one of `values`, stored as STRING(40)

const PERIODS = ['DAY', 'WEEK', 'MONTH'];
const GOAL_TYPES = ['BINARY', 'COUNT', 'QUANTITY', 'DURATION'];
const DIRECTIONS = ['AT_LEAST', 'AT_MOST', 'TRACK_ONLY'];
const UNIT_DIMENSIONS = [
    'TIME',
    'COUNT',
    'DISTANCE',
    'MASS',
    'VOLUME',
    'CUSTOM',
];
const SCHEDULE_MODES = [
    'EVERY_DAY',
    'SELECTED_DAYS',
    'FLEXIBLE_PERIOD',
    'INTERVAL_DAYS',
];
const DAYS_OF_WEEK = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
];
const ABSTINENCE_PROFILES = [
    'NONE',
    'ALCOHOL',
    'MASTURBATION',
    'SMOKING',
    'VAPING',
    'CANNABIS',
    'CAFFEINE',
    'GAMBLING',
    'SOCIAL_MEDIA',
    'BEDTIME_SCREENS',
    'IMPULSE_SHOPPING',
    'PORNOGRAPHY',
    'CUSTOM',
];

const str = (len, extra = {}) => ({ type: 'str', len, ...extra });
const enumOf = (values, extra = {}) => ({ type: 'enum', values, ...extra });

const habitRef = {
    habit_uid: {
        column: 'habit_id',
        entity: 'habit',
        required: true,
        onDelete: 'CASCADE',
    },
};

// `uid` is the client-chosen identity. `uidScope: 'user'` means the uid is
// unique per user (the fixed ids of the default groups); otherwise it is
// unique across all users. `unique` lists natural keys (column names).
const ENTITIES = {
    habit_group: {
        model: 'HabitGroup',
        table: 'habit_groups',
        uidScope: 'user',
        columns: {
            name: str(255, { required: true }),
            start_minute: { type: 'int' },
            end_minute: { type: 'int' },
            sort_order: { type: 'int', required: true, default: 0 },
        },
        refs: {},
    },
    habit: {
        model: 'Habit',
        table: 'habits',
        columns: {
            name: str(255, { required: true }),
            description: { type: 'text' },
            icon_id: str(100),
            color_argb: { type: 'int' },
            active: { type: 'bool', required: true, default: true },
            starts_on: { type: 'day', required: true, default: '1970-01-01' },
            archived: { type: 'bool', required: true, default: false },
            sort_order: { type: 'int', required: true, default: 0 },
            client_created_at: { type: 'ts' },
            timer_enabled: { type: 'bool', required: true, default: false },
            abstinence_profile: enumOf(ABSTINENCE_PROFILES, {
                required: true,
                default: 'NONE',
            }),
            abstinence_started_at: { type: 'ts' },
            abstinence_spending_minor: { type: 'big' },
            abstinence_spending_period: enumOf(PERIODS.slice(0, 3)),
            abstinence_savings_currency: str(16),
            alcohol_follow_up_time: str(5),
        },
        refs: {
            group_uid: {
                column: 'group_id',
                entity: 'habit_group',
                onDelete: 'SET NULL',
            },
        },
    },
    habit_goal: {
        model: 'HabitGoal',
        table: 'habit_goal_versions',
        columns: {
            target_minor: { type: 'big', required: true },
            period: enumOf(PERIODS, { required: true }),
            goal_type: enumOf(GOAL_TYPES, {
                required: true,
                default: 'QUANTITY',
            }),
            unit_id: str(100),
            unit_dimension: enumOf(UNIT_DIMENSIONS),
            unit_name_fr: str(100),
            unit_symbol: str(32),
            unit_scale_to_canonical: { type: 'big' },
            frequency_target: { type: 'int' },
            minimum_minor: { type: 'big' },
            direction: enumOf(DIRECTIONS, {
                required: true,
                default: 'AT_LEAST',
            }),
            progression_step: { type: 'big' },
            progression_cadence: enumOf(['WEEKLY', 'MONTHLY']),
            progression_cap_minor: { type: 'big' },
            progression_starts_on: { type: 'day' },
            effective_from: { type: 'day', required: true },
        },
        refs: habitRef,
    },
    habit_schedule: {
        model: 'HabitSchedule',
        table: 'habit_schedule_versions',
        columns: {
            schedule_mode: enumOf(SCHEDULE_MODES, {
                required: true,
                default: 'SELECTED_DAYS',
            }),
            active_days: str(100, { required: true }),
            first_day_of_week: enumOf(DAYS_OF_WEEK, { required: true }),
            effective_from: { type: 'day', required: true },
            interval_days: { type: 'int', required: true, default: 2 },
        },
        refs: habitRef,
    },
    habit_entry: {
        model: 'HabitEntry',
        table: 'habit_entries',
        columns: {
            occurred_at: { type: 'ts', required: true },
            local_date: { type: 'day', required: true },
            observed_zone_id: str(64, { required: true }),
            value_minor: { type: 'big', required: true },
            source: str(255, { required: true, default: 'MANUAL' }),
            session_id: str(100),
            note: { type: 'text' },
        },
        refs: habitRef,
        index: ['habit_id', 'local_date'],
    },
    habit_pause: {
        model: 'HabitPause',
        table: 'habit_pauses',
        columns: {
            start: { type: 'day', required: true },
            end_exclusive: { type: 'day' },
            reason: enumOf(['REST', 'ILLNESS', 'TRAVEL', 'CUSTOM', 'MANUAL']),
            reason_label: str(255),
        },
        refs: habitRef,
    },
    habit_quick_value: {
        model: 'HabitQuickValue',
        table: 'habit_quick_values',
        columns: {
            label: str(100, { required: true }),
            amount_minor: { type: 'big', required: true },
            sort_order: { type: 'int', required: true, default: 0 },
        },
        refs: habitRef,
    },
    habit_reminder: {
        model: 'HabitReminder',
        table: 'habit_reminders',
        columns: {
            time: str(5, { required: true }),
            days_of_week: str(100, { required: true, default: '' }),
            enabled: { type: 'bool', required: true, default: true },
            conditional: { type: 'bool', required: true, default: true },
        },
        refs: habitRef,
    },
    habit_timer: {
        model: 'HabitTimer',
        table: 'habit_timers',
        unique: ['habit_id'],
        columns: {
            accumulated_seconds: { type: 'big', required: true, default: 0 },
            running_since: { type: 'ts' },
        },
        refs: habitRef,
    },
    health_connect_rule: {
        model: 'HealthConnectRule',
        table: 'health_connect_rules',
        unique: ['habit_id'],
        columns: {
            exercise_types: { type: 'text', required: true },
            data_origin_package: str(255),
            enabled: { type: 'bool', required: true, default: true },
        },
        refs: habitRef,
    },
    health_connect_import: {
        model: 'HealthConnectImport',
        table: 'health_connect_imports',
        unique: ['habit_id', 'record_id'],
        columns: {
            record_id: str(255, { required: true }),
            // The imported entry. Plain text, not a reference: an ignored
            // record keeps its entry id after the entry itself is deleted.
            entry_uid: str(100, { required: true }),
            data_origin_package: str(255, { required: true }),
            state: enumOf(['IMPORTED', 'IGNORED', 'DETACHED'], {
                required: true,
            }),
        },
        refs: habitRef,
    },
    abstinence_log: {
        model: 'AbstinenceLog',
        table: 'abstinence_logs',
        columns: {
            occurred_at: { type: 'ts', required: true },
            local_date: { type: 'day', required: true },
            observed_zone_id: str(64, { required: true }),
            kind: enumOf(['CHECK_IN', 'URGE'], { required: true }),
            intensity: { type: 'int' },
            note: { type: 'text' },
        },
        refs: habitRef,
        index: ['habit_id', 'local_date'],
    },
    alcohol_consumption: {
        model: 'AlcoholConsumption',
        table: 'alcohol_consumptions',
        unique: ['habit_id', 'local_date'],
        columns: {
            local_date: { type: 'day', required: true },
            observed_zone_id: str(64, { required: true }),
            standard_drinks: { type: 'int' },
            follow_up_date: { type: 'day' },
            follow_up_notified: {
                type: 'bool',
                required: true,
                default: false,
            },
            observed_at: { type: 'ts' },
        },
        refs: habitRef,
    },
    learned_question_settings: {
        model: 'LearnedQuestionSettings',
        table: 'learned_question_settings',
        unique: ['habit_id'],
        columns: {
            enabled: { type: 'bool', required: true },
            ask_at: str(5, { required: true }),
            threshold_percent: { type: 'int', required: true },
            muted_weekdays: str(100, { required: true, default: '' }),
            silent_during_pauses: {
                type: 'bool',
                required: true,
                default: true,
            },
        },
        refs: habitRef,
    },
    learned_question_record: {
        model: 'LearnedQuestionRecord',
        table: 'learned_question_records',
        unique: ['habit_id', 'local_date'],
        columns: {
            local_date: { type: 'day', required: true },
            outcome: enumOf(['NO', 'YES', 'AMOUNT', 'DISMISSED'], {
                required: true,
            }),
            value_minor: { type: 'big' },
            recorded_at: { type: 'ts', required: true },
        },
        refs: habitRef,
    },
};

module.exports = {
    ENTITIES,
    DAYS_OF_WEEK,
    PERIODS,
    GOAL_TYPES,
    DIRECTIONS,
    SCHEDULE_MODES,
    ABSTINENCE_PROFILES,
};

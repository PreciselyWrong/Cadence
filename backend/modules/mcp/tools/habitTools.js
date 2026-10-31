'use strict';

const moment = require('moment-timezone');
const read = require('../../habits/cadence/operations/read');
const write = require('../../habits/cadence/operations/write');
const repository = require('../../habits/cadence/repository');

// MCP tools over the Cadence habits (docs/21-habits.md, "Cadence habits").
// They call the same operations as the REST routes, so a habit created here
// reaches the web and the devices through the sync journal.

function reply(payload) {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkDay(value, field) {
    if (value !== undefined && !DAY.test(value)) {
        throw new Error(`Invalid ${field}: ${value} (expected YYYY-MM-DD)`);
    }
}

function checkInstant(value, field) {
    if (value !== undefined && isNaN(new Date(value).getTime())) {
        throw new Error(`Invalid ${field}: ${value}`);
    }
}

const UID_HELP =
    'Optional client-chosen UID (8-64 characters: letters, digits, - and _). Sending the same one again returns the existing item.';

const goalProperties = {
    target_minor: {
        type: 'number',
        description:
            'Target per period in minor units: a count for yes/no and count goals, the canonical unit times the scale for amounts (seconds for time). Maximum for a limit.',
    },
    period: { type: 'string', enum: ['DAY', 'WEEK', 'MONTH'] },
    goal_type: {
        type: 'string',
        enum: ['BINARY', 'COUNT', 'QUANTITY', 'DURATION'],
        description: 'BINARY = yes/no; defaults to BINARY with a target of 1',
    },
    direction: {
        type: 'string',
        enum: ['AT_LEAST', 'AT_MOST', 'TRACK_ONLY'],
        description:
            'AT_LEAST = a target; AT_MOST = a limit (target 0 is an abstinence); TRACK_ONLY = a free activity',
    },
    unit_id: { type: 'string' },
    unit_dimension: {
        type: 'string',
        enum: ['TIME', 'COUNT', 'DISTANCE', 'MASS', 'VOLUME', 'CUSTOM'],
    },
    unit_name_fr: { type: 'string' },
    unit_symbol: { type: 'string' },
    unit_scale_to_canonical: {
        type: 'number',
        description: 'Minor units per unit (60 for minutes over seconds)',
    },
    minimum_minor: {
        type: 'number',
        description: 'Threshold that validates the period when below the ideal',
    },
    frequency_target: {
        type: 'number',
        description: 'Distinct sessions required in the period',
    },
};

const scheduleProperties = {
    schedule_mode: {
        type: 'string',
        enum: [
            'EVERY_DAY',
            'SELECTED_DAYS',
            'FLEXIBLE_PERIOD',
            'INTERVAL_DAYS',
        ],
    },
    active_days: {
        type: 'string',
        description:
            'Comma-separated weekdays for SELECTED_DAYS, e.g. MONDAY,WEDNESDAY',
    },
    interval_days: {
        type: 'number',
        description: 'For INTERVAL_DAYS: every N days (at least 2)',
    },
    first_day_of_week: {
        type: 'string',
        enum: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY',
        ],
    },
};

function pickDefined(params, keys) {
    const out = {};
    for (const key of keys) {
        if (params[key] !== undefined) out[key] = params[key];
    }
    return out;
}

const HABIT_FIELDS = [
    'name',
    'description',
    'group_uid',
    'color_argb',
    'icon_id',
    'starts_on',
    'active',
];

function registerHabitTools(server, context, tools) {
    tools.push({
        name: 'list_habits',
        description:
            'List Cadence habits with the goal and schedule in force, the progress of the current period and the streak',
        inputSchema: {
            type: 'object',
            properties: {
                archived: {
                    type: 'boolean',
                    description: 'List archived habits instead',
                },
                date: {
                    type: 'string',
                    description:
                        'Evaluate on this day (YYYY-MM-DD). Defaults to today in the user timezone.',
                },
            },
        },
        handler: async (params = {}) => {
            checkDay(params.date, 'date');
            const result = await read.listHabits(context.userId, {
                archived: params.archived === true,
                date: params.date,
            });
            return reply({ count: result.habits.length, ...result });
        },
    });

    tools.push({
        name: 'get_habit',
        description:
            'Get a habit by UID with every goal and schedule version, pauses, reminders and statistics',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
                date: {
                    type: 'string',
                    description: 'Evaluate on this day (YYYY-MM-DD)',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            checkDay(params.date, 'date');
            return reply(
                await read.getHabit(context.userId, params.uid, {
                    date: params.date,
                })
            );
        },
    });

    tools.push({
        name: 'create_habit',
        description:
            'Create a habit. Without a goal it is a daily yes/no habit. Examples: "read 20 pages" (QUANTITY, target 20), "meditate 3 times a week" (COUNT, period WEEK, target 3), "no sugar" (COUNT, AT_MOST, target 0).',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Habit name' },
                uid: { type: 'string', description: UID_HELP },
                description: { type: 'string' },
                group_uid: {
                    type: 'string',
                    description:
                        'Time-of-day group: group-morning, group-afternoon, group-evening or group-day',
                },
                starts_on: {
                    type: 'string',
                    description: 'First day (YYYY-MM-DD). Defaults to today.',
                },
                goal: {
                    type: 'object',
                    description: 'First goal version',
                    properties: goalProperties,
                },
                schedule: {
                    type: 'object',
                    description: 'First schedule version (default every day)',
                    properties: scheduleProperties,
                },
            },
            required: ['name'],
        },
        handler: async (params) => {
            checkDay(params.starts_on, 'starts_on');
            const { habit } = await write.createHabit(context.userId, {
                ...pickDefined(params, ['uid', ...HABIT_FIELDS]),
                goal: params.goal ?? {
                    target_minor: 1,
                    period: 'DAY',
                    goal_type: 'BINARY',
                    direction: 'AT_LEAST',
                },
                ...(params.schedule ? { schedule: params.schedule } : {}),
            });
            return reply({
                message: 'Habit created successfully',
                habit: await read.getHabit(context.userId, habit.uid),
            });
        },
    });

    tools.push({
        name: 'update_habit',
        description:
            'Rename a habit, change its group or description, or archive / unarchive it. Goals and schedules are versioned and not changed here.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
                name: { type: 'string' },
                description: { type: 'string' },
                group_uid: { type: 'string' },
                archived: {
                    type: 'boolean',
                    description:
                        'true archives the habit (keeps history), false restores it',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            await write.updateHabit(context.userId, params.uid, {
                ...pickDefined(params, [
                    'name',
                    'description',
                    'group_uid',
                    'archived',
                ]),
            });
            return reply({
                message: 'Habit updated successfully',
                habit: await read.getHabit(context.userId, params.uid),
            });
        },
    });

    tools.push({
        name: 'delete_habit',
        description: 'Permanently delete a habit and its history',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            await write.deleteHabit(context.userId, params.uid);
            return reply({ message: 'Habit deleted successfully' });
        },
    });

    tools.push({
        name: 'log_habit_completion',
        description:
            'Record an entry for a habit (for a limit or an abstinence this records a slip), or skip a day with a one-day pause so the streak is kept',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
                entry_uid: { type: 'string', description: UID_HELP },
                value_minor: {
                    type: 'number',
                    description:
                        'Amount in minor units of the goal (default 1, a single check-in)',
                },
                occurred_at: {
                    type: 'string',
                    description: 'Instant (ISO 8601). Defaults to now.',
                },
                local_date: {
                    type: 'string',
                    description:
                        'Civil day (YYYY-MM-DD). Defaults to the day of occurred_at in the user timezone.',
                },
                note: { type: 'string', description: 'Optional note' },
                skip: {
                    type: 'boolean',
                    description:
                        'Skip local_date (default today) instead: rest day, illness',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            checkInstant(params.occurred_at, 'occurred_at');
            checkDay(params.local_date, 'local_date');
            const userId = context.userId;
            const habit = await read.getHabitRow(userId, params.uid);

            if (params.skip) {
                const { today } = await read.userContext(userId);
                const day = params.local_date ?? today;
                const { row } = await write.createChild(
                    userId,
                    habit,
                    'habit_pause',
                    {
                        start: day,
                        end_exclusive: moment
                            .utc(day)
                            .add(1, 'day')
                            .format('YYYY-MM-DD'),
                        reason: 'REST',
                    }
                );
                return reply({
                    message: 'Day skipped',
                    pause: await write.view('habit_pause', row, userId),
                    status: (
                        await read.getHabit(userId, params.uid, { date: day })
                    ).status,
                });
            }

            const { row, created } = await write.createChild(
                userId,
                habit,
                'habit_entry',
                {
                    ...(params.entry_uid ? { uid: params.entry_uid } : {}),
                    value_minor: params.value_minor ?? 1,
                    ...pickDefined(params, [
                        'occurred_at',
                        'local_date',
                        'note',
                    ]),
                }
            );
            const entry = await write.view('habit_entry', row, userId);
            return reply({
                message: created
                    ? 'Completion logged successfully'
                    : 'Completion already logged',
                entry,
                status: (
                    await read.getHabit(userId, params.uid, {
                        date: entry.local_date,
                    })
                ).status,
            });
        },
    });

    tools.push({
        name: 'get_habit_completions',
        description:
            'Get the entries (check-ins, amounts, slips with their notes) of a habit, optionally within a range of civil days',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
                from: {
                    type: 'string',
                    description: 'First day (YYYY-MM-DD), inclusive',
                },
                to: {
                    type: 'string',
                    description: 'Last day (YYYY-MM-DD), inclusive',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            checkDay(params.from, 'from');
            checkDay(params.to, 'to');
            const userId = context.userId;
            const habit = await read.getHabitRow(userId, params.uid);
            const where = {};
            if (params.from || params.to) {
                const { Op } = require('sequelize');
                where.local_date = {
                    ...(params.from ? { [Op.gte]: params.from } : {}),
                    ...(params.to ? { [Op.lte]: params.to } : {}),
                };
            }
            const rows = await repository.listChildren(
                'habit_entry',
                userId,
                habit,
                where
            );
            const entries = await Promise.all(
                rows.map((row) => write.view('habit_entry', row, userId))
            );
            return reply({ count: entries.length, entries });
        },
    });

    tools.push({
        name: 'delete_habit_completion',
        description: 'Delete a habit entry',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
                entry_uid: { type: 'string', description: 'Entry UID' },
            },
            required: ['uid', 'entry_uid'],
        },
        handler: async (params) => {
            const habit = await read.getHabitRow(context.userId, params.uid);
            await write.deleteChild(
                context.userId,
                habit,
                'habit_entry',
                params.entry_uid
            );
            return reply({ message: 'Completion deleted successfully' });
        },
    });

    tools.push({
        name: 'get_habit_stats',
        description:
            'Get habit statistics: the state of the current period, current and best streak, success rate and activity over time',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Habit UID' },
                date: {
                    type: 'string',
                    description: 'Evaluate on this day (YYYY-MM-DD)',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            checkDay(params.date, 'date');
            const { status, stats } = await read.getHabit(
                context.userId,
                params.uid,
                { date: params.date }
            );
            return reply({ status, ...stats });
        },
    });
}

module.exports = { registerHabitTools };

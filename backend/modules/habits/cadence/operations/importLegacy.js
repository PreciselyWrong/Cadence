'use strict';

const { Op } = require('sequelize');
const moment = require('moment-timezone');
const { uid: generateUid } = require('../../../../utils/uid');
const { getSafeTimezone } = require('../../../../utils/timezone-utils');
const { ENTITIES } = require('../schema');
const { validate } = require('../validation');
const { ensureDefaultGroups } = require('./defaultGroups');

// Turns the habits of upstream Tududi (task rows with `habit_*` and their
// check-ins in `recurring_completions`) into Cadence habits, as version 1 of
// their goal and schedule. Nothing legacy is changed or removed. A habit is
// imported once: the Cadence habit takes the uid of its task, so a second run
// finds it and moves on. See docs/21-habits.md, "Importing Tududi habits".

const ARCHIVED_STATUSES = [3, 5];
const SUNDAY_FIRST = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
];
const ALL_DAYS = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
].join(',');
const PERIOD = {
    daily: 'DAY',
    weekly: 'WEEK',
    monthly: 'MONTH',
    interval: 'DAY',
};
const GROUP_OF = {
    morning: 'group-morning',
    afternoon: 'group-afternoon',
    evening: 'group-evening',
};
// Two decimals survive when a legacy amount is not a whole number.
const DECIMAL_SCALE = 100;

function colorToArgb(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
    return match ? 0xff000000 | parseInt(match[1], 16) | 0 : null;
}

function slug(text) {
    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
}

const dayKey = (date, timezone) =>
    moment(date).tz(timezone).format('YYYY-MM-DD');

// Reads the legacy columns the way habitEngine.normalizeConfig does.
function legacyConfig(task) {
    const frequency = ['daily', 'weekly', 'monthly', 'interval'].includes(
        task.habit_frequency_period
    )
        ? task.habit_frequency_period
        : 'daily';
    const quit = task.habit_polarity === 'quit';
    const targetValue = Number(task.habit_target_value);
    const measurable = !quit && Number.isFinite(targetValue) && targetValue > 0;
    const days =
        frequency === 'daily' &&
        Array.isArray(task.habit_schedule_days) &&
        task.habit_schedule_days.length > 0 &&
        task.habit_schedule_days.length < 7
            ? task.habit_schedule_days.map(Number)
            : null;
    return {
        frequency,
        quit,
        measurable,
        targetValue,
        targetCount: Math.max(1, parseInt(task.habit_target_count, 10) || 1),
        days,
        intervalDays:
            frequency === 'interval'
                ? Math.max(2, parseInt(task.habit_interval_days, 10) || 2)
                : null,
    };
}

function goalRow(task, cfg, scale) {
    const base = { period: PERIOD[cfg.frequency] };
    if (cfg.quit) {
        return {
            ...base,
            target_minor: 0,
            goal_type: 'COUNT',
            direction: 'AT_MOST',
        };
    }
    if (cfg.measurable) {
        const name = String(task.habit_unit ?? '').trim();
        const withUnit = name !== '' || scale !== 1;
        return {
            ...base,
            target_minor: Math.round(cfg.targetValue * scale),
            goal_type: 'QUANTITY',
            direction: 'AT_LEAST',
            ...(withUnit
                ? {
                      unit_id: `custom:${slug(name) || 'value'}`,
                      unit_dimension: 'CUSTOM',
                      unit_name_fr: name.slice(0, 100),
                      unit_symbol: name.slice(0, 32),
                      unit_scale_to_canonical: scale,
                  }
                : {}),
        };
    }
    const binary = cfg.frequency === 'daily' && cfg.targetCount === 1;
    return {
        ...base,
        target_minor: cfg.targetCount,
        goal_type: binary ? 'BINARY' : 'COUNT',
        direction: 'AT_LEAST',
    };
}

function scheduleRow(cfg, firstDayOfWeek) {
    let mode = 'EVERY_DAY';
    let activeDays = ALL_DAYS;
    if (cfg.frequency === 'weekly' || cfg.frequency === 'monthly') {
        mode = 'FLEXIBLE_PERIOD';
    } else if (cfg.frequency === 'interval') {
        mode = 'INTERVAL_DAYS';
    } else if (cfg.days) {
        mode = 'SELECTED_DAYS';
        activeDays = cfg.days.map((d) => SUNDAY_FIRST[d]).join(',');
    }
    return {
        schedule_mode: mode,
        active_days: activeDays,
        first_day_of_week: SUNDAY_FIRST[firstDayOfWeek] ?? 'MONDAY',
        interval_days: cfg.intervalDays ?? 2,
    };
}

async function create(models, entity, userId, values, transaction) {
    const error = await validate(entity, null, values, userId);
    if (error) {
        throw new Error(`Legacy habit import: invalid ${entity} (${error})`);
    }
    return models[ENTITIES[entity].model].create(
        { uid: generateUid(), user_id: userId, ...values },
        { transaction }
    );
}

async function importOne(models, task, ctx, report) {
    const { RecurringCompletion } = models;
    const cfg = legacyConfig(task);
    const completions = await RecurringCompletion.findAll({
        where: { task_id: task.id },
        order: [['completed_at', 'ASC']],
    });
    const checkIns = completions.filter((c) => !c.skipped);
    const skips = completions.filter((c) => c.skipped);

    const usable = checkIns.filter(
        (c) => cfg.quit || !cfg.measurable || Number(c.value) > 0
    );
    report.droppedEntries += checkIns.length - usable.length;

    const amounts = [cfg.targetValue, ...usable.map((c) => Number(c.value))];
    const scale =
        cfg.measurable && !amounts.every((n) => Number.isInteger(n))
            ? DECIMAL_SCALE
            : 1;

    const days = [
        dayKey(task.created_at, ctx.timezone),
        ...completions.map((c) => dayKey(c.completed_at, ctx.timezone)),
    ].sort();
    const startsOn = days[0];

    const skippedDays = new Set(
        skips.map((s) => dayKey(s.completed_at, ctx.timezone))
    );

    await models.sequelize.transaction(async (transaction) => {
        const habit = await models.Habit.create(
            {
                uid: task.uid,
                user_id: task.user_id,
                name: String(task.name ?? '').slice(0, 255) || 'Habit',
                description: task.note || null,
                color_argb: colorToArgb(task.habit_color),
                active: true,
                starts_on: startsOn,
                archived: ARCHIVED_STATUSES.includes(task.status),
                client_created_at: task.created_at,
                group_id:
                    ctx.groupIds[GROUP_OF[task.habit_time_of_day]] ?? null,
            },
            { transaction }
        );
        const own = { habit_id: habit.id };
        const make = (entity, values) =>
            create(
                models,
                entity,
                task.user_id,
                { ...own, ...values },
                transaction
            );

        await make('habit_goal', {
            ...goalRow(task, cfg, scale),
            effective_from: startsOn,
        });
        await make('habit_schedule', {
            ...scheduleRow(cfg, ctx.firstDayOfWeek),
            effective_from: startsOn,
        });
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(task.habit_reminder_time ?? '')) {
            await make('habit_reminder', {
                time: task.habit_reminder_time,
                days_of_week: '',
                enabled: true,
                conditional: true,
            });
        }
        for (const check of usable) {
            await make('habit_entry', {
                ...(check.uid ? { uid: check.uid } : {}),
                occurred_at: check.completed_at,
                local_date: dayKey(check.completed_at, ctx.timezone),
                observed_zone_id: ctx.timezone,
                value_minor:
                    cfg.measurable && !cfg.quit
                        ? Math.round(Number(check.value) * scale)
                        : 1,
                source: 'MANUAL',
                note: check.note ? String(check.note) : null,
            });
        }
        for (const date of skippedDays) {
            await make('habit_pause', {
                start: date,
                end_exclusive: moment
                    .utc(date)
                    .add(1, 'day')
                    .format('YYYY-MM-DD'),
                reason: 'REST',
            });
        }
    });
    report.entries += usable.length;
    report.pauses += skippedDays.size;
    report.imported += 1;
}

// Imports the not yet imported habits of one user. Returns counts.
async function importLegacyHabits(userId) {
    const models = require('../../../../models');
    const { Task, User, Habit } = models;
    const report = {
        imported: 0,
        alreadyImported: 0,
        entries: 0,
        pauses: 0,
        droppedEntries: 0,
    };

    const tasks = await Task.findAll({
        where: { user_id: userId, habit_mode: true },
        order: [['id', 'ASC']],
    });
    if (tasks.length === 0) return report;

    const known = new Set(
        (
            await Habit.findAll({
                where: {
                    user_id: userId,
                    uid: { [Op.in]: tasks.map((t) => t.uid) },
                },
                attributes: ['uid'],
            })
        ).map((h) => h.uid)
    );
    const pending = tasks.filter((t) => !known.has(t.uid));
    report.alreadyImported = tasks.length - pending.length;
    if (pending.length === 0) return report;

    const user = await User.findByPk(userId, {
        attributes: ['id', 'timezone', 'first_day_of_week'],
    });
    await ensureDefaultGroups(userId);
    const groups = await models.HabitGroup.findAll({
        where: { user_id: userId },
        attributes: ['id', 'uid'],
    });
    const ctx = {
        timezone: getSafeTimezone(user?.timezone),
        firstDayOfWeek: Number.isInteger(user?.first_day_of_week)
            ? user.first_day_of_week
            : 1,
        groupIds: Object.fromEntries(groups.map((g) => [g.uid, g.id])),
    };
    for (const task of pending) {
        await importOne(models, task, ctx, report);
    }
    return report;
}

// For every user who has legacy habits (start-up backfill).
async function importAllLegacyHabits() {
    const { Task } = require('../../../../models');
    const rows = await Task.findAll({
        where: { habit_mode: true },
        attributes: ['user_id'],
        group: ['user_id'],
        raw: true,
    });
    const total = {
        users: 0,
        imported: 0,
        entries: 0,
        pauses: 0,
        droppedEntries: 0,
    };
    for (const { user_id: userId } of rows) {
        const report = await importLegacyHabits(userId);
        if (report.imported > 0) total.users += 1;
        for (const key of ['imported', 'entries', 'pauses', 'droppedEntries']) {
            total[key] += report[key];
        }
    }
    return total;
}

module.exports = { importLegacyHabits, importAllLegacyHabits, legacyConfig };

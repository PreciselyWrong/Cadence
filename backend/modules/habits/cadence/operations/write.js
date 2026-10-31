'use strict';

const moment = require('moment-timezone');
const models = require('../../../../models');
const {
    NotFoundError,
    ValidationError,
    ConflictError,
} = require('../../../../shared/errors');
const { uid: generateUid } = require('../../../../utils/uid');
const { ENTITIES, DAYS_OF_WEEK } = require('../schema');
const { validate } = require('../validation');
const repository = require('../repository');
const { serialize, idMap } = require('../core/serializers');
const { userContext } = require('./read');
const { ensureDefaultGroups } = require('./defaultGroups');
const { destroyHabit, destroyGroup } = require('./destroy');

// Writes of the web UI. They go through the same models, hooks and validation
// as the sync push, so every change reaches the devices through the journal.

const UID = /^[A-Za-z0-9_-]{8,64}$/;

function fail(code) {
    throw new ValidationError(code);
}

// The body's wire fields as column values; anything else is refused.
function pick(entity, body, { create }) {
    const def = ENTITIES[entity];
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        fail('invalid_body');
    }
    const allowed = new Set([
        ...Object.keys(def.columns),
        ...Object.keys(def.refs),
        ...(create ? ['uid'] : []),
    ]);
    const values = {};
    const refs = {};
    for (const [key, value] of Object.entries(body)) {
        if (!allowed.has(key)) fail(`unknown_field:${key}`);
        if (key in def.refs) refs[key] = value;
        else if (key !== 'uid') values[key] = value;
    }
    return { values, refs, uid: body.uid };
}

function checkUid(uid) {
    if (uid !== undefined && (typeof uid !== 'string' || !UID.test(uid))) {
        fail('invalid_uid');
    }
}

async function check(entity, row, values, userId) {
    const error = await validate(entity, row, values, userId);
    if (error) fail(error);
}

async function groupIdOf(userId, groupUid) {
    if (groupUid === null) return null;
    if (typeof groupUid !== 'string') fail('invalid_reference:group_uid');
    const group = await repository.findGroup(userId, groupUid);
    if (!group) fail('invalid_reference:group_uid');
    return group.id;
}

const view = async (entity, row, userId, extra = {}) => {
    const habits = await models.Habit.findAll({
        where: { user_id: userId },
        attributes: ['id', 'uid'],
    });
    const groups = await repository.listGroups(userId);
    return serialize(entity, row, {
        habit: idMap(habits),
        habit_group: idMap(groups),
        ...extra,
    });
};

// --- Habits ----------------------------------------------------------------

const DEFAULT_SCHEDULE = {
    schedule_mode: 'EVERY_DAY',
    active_days: DAYS_OF_WEEK.join(','),
    interval_days: 2,
};

async function createHabit(userId, body) {
    if (!body || typeof body !== 'object') fail('invalid_body');
    const { goal, schedule, effective_from: effectiveFrom, ...fields } = body;
    const { values, refs, uid } = pick('habit', fields, { create: true });
    checkUid(uid);
    if (uid) {
        const existing = await repository.findAnyByUid('habit', uid);
        if (existing && existing.user_id !== userId) {
            throw new ConflictError('uid already used');
        }
        if (existing) return { habit: existing, created: false };
    }
    if (!goal) fail('missing_field:goal');

    const ctx = await userContext(userId);
    const startsOn = values.starts_on ?? ctx.today;
    const from = effectiveFrom ?? startsOn;
    await ensureDefaultGroups(userId);
    if (refs.group_uid !== undefined) {
        values.group_id = await groupIdOf(userId, refs.group_uid);
    }
    const user = await models.User.findByPk(userId, {
        attributes: ['first_day_of_week'],
    });
    const firstDay =
        DAYS_OF_WEEK[((user?.first_day_of_week ?? 1) + 6) % 7] ?? 'MONDAY';

    const habit = await models.sequelize.transaction(async (transaction) => {
        const prepared = { ...values, starts_on: startsOn, user_id: userId };
        await check('habit', null, prepared, userId);
        const created = await models.Habit.create(
            { ...(uid ? { uid } : {}), ...prepared },
            { transaction }
        );
        const goalPick = pick('habit_goal', goal, { create: false });
        const goalValues = {
            ...goalPick.values,
            habit_id: created.id,
            effective_from: from,
        };
        await check('habit_goal', null, goalValues, userId);
        await models.HabitGoal.create(
            { uid: generateUid(), user_id: userId, ...goalValues },
            { transaction }
        );
        const schedulePick = pick('habit_schedule', schedule ?? {}, {
            create: false,
        });
        const scheduleValues = {
            first_day_of_week: firstDay,
            ...DEFAULT_SCHEDULE,
            ...schedulePick.values,
            habit_id: created.id,
            effective_from: from,
        };
        await check('habit_schedule', null, scheduleValues, userId);
        await models.HabitSchedule.create(
            { uid: generateUid(), user_id: userId, ...scheduleValues },
            { transaction }
        );
        return created;
    });
    return { habit, created: true };
}

async function updateHabit(userId, uid, body) {
    const habit = await repository.findHabit(userId, uid);
    if (!habit) throw new NotFoundError('Habit not found');
    const { values, refs } = pick('habit', body, { create: false });
    if (refs.group_uid !== undefined) {
        values.group_id = await groupIdOf(userId, refs.group_uid);
    }
    await check('habit', habit, values, userId);
    habit.set(values);
    await habit.save();
    return habit;
}

async function deleteHabit(userId, uid) {
    const habit = await repository.findHabit(userId, uid);
    if (!habit) throw new NotFoundError('Habit not found');
    await destroyHabit(habit, userId);
}

// --- Rows that hang from a habit --------------------------------------------

// Defaults a web client does not have to compute.
async function entryDefaults(userId, values) {
    const ctx = await userContext(userId);
    const occurredAt = values.occurred_at ?? new Date().toISOString();
    const zone = values.observed_zone_id ?? ctx.timezone;
    if (!moment.tz.zone(zone)) fail('invalid_value:observed_zone_id');
    return {
        occurred_at: occurredAt,
        observed_zone_id: zone,
        local_date:
            values.local_date ??
            moment(occurredAt).tz(zone).format('YYYY-MM-DD'),
        source: 'MANUAL',
        ...values,
    };
}

async function createChild(userId, habit, entity, body) {
    const { values, uid } = pick(entity, body, { create: true });
    checkUid(uid);
    if (uid) {
        const existing = await repository.findAnyByUid(entity, uid);
        if (existing && existing.user_id !== userId) {
            throw new ConflictError('uid already used');
        }
        if (existing && existing.habit_id !== habit.id) {
            throw new ConflictError('uid belongs to another habit');
        }
        if (existing) return { row: existing, created: false };
    }
    const prepared =
        entity === 'habit_entry' ? await entryDefaults(userId, values) : values;
    const withHabit = { ...prepared, habit_id: habit.id };
    await check(entity, null, withHabit, userId);
    const row = await models[ENTITIES[entity].model].create({
        ...(uid ? { uid } : {}),
        user_id: userId,
        ...withHabit,
    });
    return { row, created: true };
}

async function updateChild(userId, habit, entity, uid, body) {
    const row = await repository.findChild(entity, userId, habit, uid);
    if (!row) throw new NotFoundError('Not found');
    const { values } = pick(entity, body, { create: false });
    await check(entity, row, values, userId);
    row.set(values);
    await row.save();
    return row;
}

async function deleteChild(userId, habit, entity, uid) {
    const row = await repository.findChild(entity, userId, habit, uid);
    if (!row) throw new NotFoundError('Not found');
    await row.destroy();
}

// One row per habit (timer, Health Connect rule, learned-question settings),
// whose uid is the habit's own: written whether or not it exists yet.
async function putSingle(userId, habit, entity, body) {
    const existing = (await repository.listChildren(entity, userId, habit))[0];
    if (existing) {
        return {
            row: await updateChild(userId, habit, entity, existing.uid, body),
            created: false,
        };
    }
    return createChild(userId, habit, entity, { ...body, uid: habit.uid });
}

// --- Groups ------------------------------------------------------------------

async function createGroup(userId, body) {
    const { values, uid } = pick('habit_group', body, { create: true });
    checkUid(uid);
    if (uid) {
        const existing = await repository.findGroup(userId, uid);
        if (existing) return { group: existing, created: false };
    }
    await ensureDefaultGroups(userId);
    await check('habit_group', null, values, userId);
    const group = await models.HabitGroup.create({
        ...(uid ? { uid } : {}),
        user_id: userId,
        ...values,
    });
    return { group, created: true };
}

async function updateGroup(userId, uid, body) {
    const group = await repository.findGroup(userId, uid);
    if (!group) throw new NotFoundError('Group not found');
    const { values } = pick('habit_group', body, { create: false });
    await check('habit_group', group, values, userId);
    group.set(values);
    await group.save();
    return group;
}

async function deleteGroup(userId, uid) {
    const group = await repository.findGroup(userId, uid);
    if (!group) throw new NotFoundError('Group not found');
    await destroyGroup(group, userId);
}

module.exports = {
    view,
    createHabit,
    updateHabit,
    deleteHabit,
    createChild,
    updateChild,
    deleteChild,
    putSingle,
    createGroup,
    updateGroup,
    deleteGroup,
};

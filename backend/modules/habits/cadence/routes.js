'use strict';

const express = require('express');
const { requireAuth } = require('../../../middleware/auth');
const idempotency = require('../../../middleware/idempotency');
const read = require('./operations/read');
const write = require('./operations/write');
const { importLegacyHabits } = require('./operations/importLegacy');
const { NotFoundError } = require('../../../shared/errors');

// REST of the Cadence habits (docs/21-habits.md, "Cadence habits"). Rows use
// the field names of the sync protocol. Every route is the signed-in user's
// own data: a uid of someone else is a 404.

const router = express.Router();

// Rows that hang from a habit: a list with POST, and PATCH/DELETE by uid.
const COLLECTIONS = {
    goals: 'habit_goal',
    schedules: 'habit_schedule',
    entries: 'habit_entry',
    pauses: 'habit_pause',
    'quick-values': 'habit_quick_value',
    reminders: 'habit_reminder',
    'health-connect-imports': 'health_connect_import',
    'abstinence-logs': 'abstinence_log',
    'alcohol-consumptions': 'alcohol_consumption',
    'learned-question-records': 'learned_question_record',
};
// One row per habit: GET, PUT (create or update) and DELETE.
const SINGLES = {
    timer: 'habit_timer',
    'health-connect-rule': 'health_connect_rule',
    'learned-question-settings': 'learned_question_settings',
};

const handle = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (error) {
        next(error);
    }
};

const bool = (value) =>
    value === undefined ? undefined : value === 'true' || value === '1';

// --- Habits ------------------------------------------------------------------

router.get(
    '/cadence/habits',
    requireAuth,
    handle(async (req, res) => {
        res.json(
            await read.listHabits(req.currentUser.id, {
                archived: bool(req.query.archived),
                date: req.query.date,
            })
        );
    })
);

router.post(
    '/cadence/habits',
    requireAuth,
    idempotency,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const { habit, created } = await write.createHabit(userId, req.body);
        res.status(created ? 201 : 200).json(
            await read.getHabit(userId, habit.uid)
        );
    })
);

router.post(
    '/cadence/import-legacy',
    requireAuth,
    handle(async (req, res) => {
        res.json(await importLegacyHabits(req.currentUser.id));
    })
);

router.get(
    '/cadence/habits/:uid',
    requireAuth,
    handle(async (req, res) => {
        res.json(
            await read.getHabit(req.currentUser.id, req.params.uid, {
                date: req.query.date,
            })
        );
    })
);

router.patch(
    '/cadence/habits/:uid',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        await write.updateHabit(userId, req.params.uid, req.body);
        res.json(await read.getHabit(userId, req.params.uid));
    })
);

router.delete(
    '/cadence/habits/:uid',
    requireAuth,
    handle(async (req, res) => {
        await write.deleteHabit(req.currentUser.id, req.params.uid);
        res.json({ deleted: true });
    })
);

// --- Rows that hang from a habit ---------------------------------------------

const entityOf = (collections, req) => {
    const entity = collections[req.params.collection];
    if (!entity) throw new NotFoundError('Unknown collection');
    return entity;
};

router.get(
    '/cadence/habits/:uid/:collection',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const habit = await read.getHabitRow(userId, req.params.uid);
        const repository = require('./repository');
        const entity =
            COLLECTIONS[req.params.collection] ??
            SINGLES[req.params.collection];
        if (!entity) throw new NotFoundError('Unknown collection');
        const where = {};
        const { from, to } = req.query;
        if (entity === 'habit_entry' && (from || to)) {
            const { Op } = require('sequelize');
            where.local_date = {
                ...(from ? { [Op.gte]: from } : {}),
                ...(to ? { [Op.lte]: to } : {}),
            };
        }
        const rows = await repository.listChildren(
            entity,
            userId,
            habit,
            where
        );
        const items = await Promise.all(
            rows.map((row) => write.view(entity, row, userId))
        );
        res.json(req.params.collection in SINGLES ? (items[0] ?? null) : items);
    })
);

router.post(
    '/cadence/habits/:uid/:collection',
    requireAuth,
    idempotency,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const entity = entityOf(COLLECTIONS, req);
        const habit = await read.getHabitRow(userId, req.params.uid);
        const { row, created } = await write.createChild(
            userId,
            habit,
            entity,
            req.body
        );
        res.status(created ? 201 : 200).json(
            await write.view(entity, row, userId)
        );
    })
);

router.put(
    '/cadence/habits/:uid/:collection',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const entity = entityOf(SINGLES, req);
        const habit = await read.getHabitRow(userId, req.params.uid);
        const { row, created } = await write.putSingle(
            userId,
            habit,
            entity,
            req.body
        );
        res.status(created ? 201 : 200).json(
            await write.view(entity, row, userId)
        );
    })
);

router.delete(
    '/cadence/habits/:uid/:collection',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const entity = entityOf(SINGLES, req);
        const habit = await read.getHabitRow(userId, req.params.uid);
        await write.deleteChild(userId, habit, entity, habit.uid);
        res.json({ deleted: true });
    })
);

router.patch(
    '/cadence/habits/:uid/:collection/:childUid',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const entity = entityOf(COLLECTIONS, req);
        const habit = await read.getHabitRow(userId, req.params.uid);
        const row = await write.updateChild(
            userId,
            habit,
            entity,
            req.params.childUid,
            req.body
        );
        res.json(await write.view(entity, row, userId));
    })
);

router.delete(
    '/cadence/habits/:uid/:collection/:childUid',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const entity = entityOf(COLLECTIONS, req);
        const habit = await read.getHabitRow(userId, req.params.uid);
        await write.deleteChild(userId, habit, entity, req.params.childUid);
        res.json({ deleted: true });
    })
);

// --- Groups ------------------------------------------------------------------

router.get(
    '/cadence/groups',
    requireAuth,
    handle(async (req, res) => {
        res.json(await read.listGroups(req.currentUser.id));
    })
);

router.post(
    '/cadence/groups',
    requireAuth,
    idempotency,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const { group, created } = await write.createGroup(userId, req.body);
        res.status(created ? 201 : 200).json(
            await write.view('habit_group', group, userId)
        );
    })
);

router.patch(
    '/cadence/groups/:uid',
    requireAuth,
    handle(async (req, res) => {
        const userId = req.currentUser.id;
        const group = await write.updateGroup(userId, req.params.uid, req.body);
        res.json(await write.view('habit_group', group, userId));
    })
);

router.delete(
    '/cadence/groups/:uid',
    requireAuth,
    handle(async (req, res) => {
        await write.deleteGroup(req.currentUser.id, req.params.uid);
        res.json({ deleted: true });
    })
);

module.exports = router;

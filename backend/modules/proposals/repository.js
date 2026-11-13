'use strict';

// Data access for proposals: the only place that touches their models.
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const {
    Area,
    Goal,
    Notification,
    Proposal,
    Project,
    Tag,
    Task,
} = require('../../models');
const permissionsService = require('../../services/permissionsService');

// Done, archived and cancelled tasks are closed.
const CLOSED_STATUSES = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];

const visibleWhere = async (userId) => ({
    [Op.and]: [
        await permissionsService.ownershipOrPermissionWhere('task', userId),
        await permissionsService.myWorkWhere(userId),
    ],
});

// Projects the context reads: the ones still in hand, not paused or closed.
const ACTIVE_PROJECT_STATUSES = [
    'not_started',
    'in_progress',
    'planned',
    'waiting',
];
const CONTEXT_PROJECTS = 15;
const CONTEXT_AREAS = 10;

const create = (attributes) => Proposal.create(attributes);

// Ready proposals of one kind are closed when a newer one replaces them.
const dismissReady = (userId, kind) =>
    Proposal.update(
        { status: 'dismissed' },
        { where: { user_id: userId, kind, status: 'ready' } }
    );

const findByUid = (userId, uid) =>
    Proposal.findOne({ where: { user_id: userId, uid } });

const findPending = (userId, kind) =>
    Proposal.findOne({
        where: { user_id: userId, kind, status: 'pending' },
        order: [['created_at', 'DESC']],
    });

// The latest proposal of each kind, optionally only those in one status.
async function findLatestPerKind(userId, status = null) {
    const rows = await Proposal.findAll({
        where: status ? { user_id: userId, status } : { user_id: userId },
        order: [
            ['created_at', 'DESC'],
            ['id', 'DESC'],
        ],
    });
    const latest = new Map();
    for (const row of rows) {
        if (!latest.has(row.kind)) latest.set(row.kind, row);
    }
    return [...latest.values()];
}

// Review answers already given, newest first: the judgements a new review can
// reuse for tasks that have not changed.
const findJudgedReviews = (userId, limit) =>
    Proposal.findAll({
        where: {
            user_id: userId,
            kind: 'review',
            status: { [Op.in]: ['ready', 'applied'] },
        },
        order: [
            ['created_at', 'DESC'],
            ['id', 'DESC'],
        ],
        limit,
    });

// Names of the areas the user can see, the context of the facts.
async function findAreaNames(userId) {
    const areas = await Area.findAll({
        where: await permissionsService.ownershipOrPermissionWhere(
            'area',
            userId
        ),
        attributes: ['name'],
        order: [['name', 'ASC']],
        limit: CONTEXT_AREAS,
    });
    return areas.map((area) => area.name);
}

// Active projects the user can see, most recently touched first, with the
// name of their area.
async function findActiveProjects(userId) {
    return Project.findAll({
        where: {
            [Op.and]: [
                { status: { [Op.in]: ACTIVE_PROJECT_STATUSES } },
                await permissionsService.ownershipOrPermissionWhere(
                    'project',
                    userId
                ),
            ],
        },
        include: [{ model: Area, attributes: ['name'], required: false }],
        attributes: ['name'],
        order: [
            ['updated_at', 'DESC'],
            ['id', 'DESC'],
        ],
        limit: CONTEXT_PROJECTS,
    });
}

// Open tasks that could appear in a week: overdue, due before the period
// ends, planned in it, decided for the week, or in view. Recurring
// occurrences and subtasks are left out here; the rules keep the rest.
async function findWeekCandidates(
    userId,
    { periodEnd, weekStart, plannedUids }
) {
    const where = {
        [Op.and]: [
            await visibleWhere(userId),
            {
                status: { [Op.notIn]: CLOSED_STATUSES },
                habit_mode: false,
                parent_task_id: null,
                recurring_parent_id: null,
                [Op.or]: [
                    {
                        due_date: {
                            [Op.lt]: moment
                                .tz(periodEnd, 'YYYY-MM-DD', 'UTC')
                                .add(2, 'days')
                                .toDate(),
                        },
                    },
                    { week_of: weekStart },
                    { in_view_at: { [Op.ne]: null } },
                    {
                        uid: {
                            [Op.in]: plannedUids.length ? plannedUids : [''],
                        },
                    },
                ],
            },
        ],
    };
    return Task.findAll({
        where,
        include: [
            {
                model: Project,
                attributes: ['uid', 'name'],
                required: false,
                include: [
                    { model: Area, attributes: ['name'], required: false },
                ],
            },
            {
                model: Goal,
                as: 'Goal',
                attributes: ['title'],
                required: false,
                include: [
                    { model: Area, attributes: ['name'], required: false },
                ],
            },
            { model: Area, attributes: ['name'], required: false },
            {
                model: Tag,
                attributes: ['name'],
                through: { attributes: [] },
                required: false,
            },
        ],
        order: [['id', 'ASC']],
    });
}

const notify = (attributes) => Notification.createNotification(attributes);

module.exports = {
    create,
    dismissReady,
    findByUid,
    findPending,
    findLatestPerKind,
    findJudgedReviews,
    findAreaNames,
    findActiveProjects,
    findWeekCandidates,
    notify,
};

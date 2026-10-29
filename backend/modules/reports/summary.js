'use strict';

const { Op } = require('sequelize');
const moment = require('moment-timezone');
const { Task, Tag, Project } = require('../../models');
const permissionsService = require('../../services/permissionsService');
const {
    getSafeTimezone,
    dateStringToUTC,
    utcToUserDateString,
} = require('../../utils/timezone-utils');

const MAX_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_NAMES = {
    0: 'not_started',
    1: 'in_progress',
    2: 'done',
    3: 'archived',
    4: 'waiting',
    5: 'cancelled',
    6: 'planned',
};

class SummaryRangeError extends Error {}

// Returns an error message for a bad range, or null when it is valid.
function validateRange(start, end) {
    if (
        !DATE_RE.test(start || '') ||
        !DATE_RE.test(end || '') ||
        !moment(start, 'YYYY-MM-DD', true).isValid() ||
        !moment(end, 'YYYY-MM-DD', true).isValid()
    ) {
        return 'start and end must be YYYY-MM-DD dates.';
    }
    const days =
        moment
            .utc(end, 'YYYY-MM-DD')
            .diff(moment.utc(start, 'YYYY-MM-DD'), 'days') + 1;
    if (days < 1) return 'end must not be before start.';
    if (days > MAX_DAYS) return `The range can be at most ${MAX_DAYS} days.`;
    return null;
}

function serialize(task, tz) {
    return {
        uid: task.uid,
        name: task.name,
        status: STATUS_NAMES[task.status] || String(task.status),
        completed_at: task.completed_at
            ? new Date(task.completed_at).toISOString()
            : null,
        completed_date: task.completed_at
            ? utcToUserDateString(task.completed_at, tz)
            : null,
        due_date: task.due_date ? utcToUserDateString(task.due_date, tz) : null,
        project: task.Project
            ? { uid: task.Project.uid, name: task.Project.name }
            : null,
        tags: (task.Tags || []).map((t) => t.name),
    };
}

// Tasks completed in [start, end] (whole days in the user's timezone), plus
// open tasks due in that range when includeOpen is set. Visibility follows
// the task lists: own tasks and tasks shared directly or through a project.
async function getSummary(userId, { start, end, includeOpen }, timezone) {
    const problem = validateRange(start, end);
    if (problem) throw new SummaryRangeError(problem);

    const tz = getSafeTimezone(timezone);
    const from = dateStringToUTC(start, tz, 'start');
    const to = dateStringToUTC(end, tz, 'end');

    const visible = await permissionsService.ownershipOrPermissionWhere(
        'task',
        userId
    );

    const rangeConditions = [
        {
            status: Task.STATUS.DONE,
            completed_at: { [Op.between]: [from, to] },
        },
    ];
    if (includeOpen) {
        rangeConditions.push({
            status: {
                [Op.notIn]: [
                    Task.STATUS.DONE,
                    Task.STATUS.ARCHIVED,
                    Task.STATUS.CANCELLED,
                ],
            },
            due_date: { [Op.between]: [from, to] },
        });
    }

    const tasks = await Task.findAll({
        where: {
            [Op.and]: [
                visible,
                { parent_task_id: null },
                { [Op.or]: rangeConditions },
            ],
        },
        include: [
            {
                model: Tag,
                attributes: ['name'],
                through: { attributes: [] },
                required: false,
            },
            {
                model: Project,
                attributes: ['uid', 'name'],
                required: false,
            },
        ],
        order: [
            ['completed_at', 'ASC'],
            ['due_date', 'ASC'],
            ['id', 'ASC'],
        ],
    });

    const items = tasks.map((t) => serialize(t, tz));
    return {
        start,
        end,
        timezone: tz,
        include_open: Boolean(includeOpen),
        completed_count: items.filter((t) => t.status === 'done').length,
        open_count: items.filter((t) => t.status !== 'done').length,
        tasks: items,
    };
}

module.exports = { getSummary, validateRange, SummaryRangeError, MAX_DAYS };

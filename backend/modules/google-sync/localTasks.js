'use strict';

const { Op } = require('sequelize');
const { Task, Project, TaskAttachment } = require('../../models');
const {
    planOccurrenceAdvance,
    recordOccurrence,
} = require('../tasks/operations/recurring');
const {
    handleParentChildOnStatusChange,
} = require('../tasks/operations/parent-child');
const { destroyTaskRows } = require('../tasks/operations/deletion');
const { getConfig } = require('../../config/config');

// A task finished longer ago than this is not sent to Google the first
// time; once linked it keeps syncing.
const RECENTLY_DONE_DAYS = 7;
const HIDDEN_STATUSES = [Task.STATUS.ARCHIVED, Task.STATUS.CANCELLED];

// Tasks the user owns that belong on Google, plus every task already linked
// (so a task that left the set can be removed there).
async function loadTasks(userId, linkedTaskIds = []) {
    const since = new Date(Date.now() - RECENTLY_DONE_DAYS * 86400000);
    const tasks = await Task.findAll({
        where: {
            user_id: userId,
            [Op.or]: [
                { id: { [Op.in]: linkedTaskIds.length ? linkedTaskIds : [0] } },
                {
                    recurring_parent_id: null,
                    habit_mode: { [Op.not]: true },
                    status: { [Op.notIn]: HIDDEN_STATUSES },
                    [Op.or]: [
                        { status: { [Op.ne]: Task.STATUS.DONE } },
                        { completed_at: { [Op.gte]: since } },
                    ],
                },
            ],
        },
        order: [['id', 'ASC']],
    });
    return tasks;
}

// Whether a task belongs on Google at all.
function isSyncable(task) {
    return (
        !task.recurring_parent_id &&
        !task.habit_mode &&
        !HIDDEN_STATUSES.includes(Number(task.status))
    );
}

// Parents before their subtasks, so a subtask can name its parent's Google id.
function parentsFirst(tasks) {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const depth = (task, seen = new Set()) => {
        if (!task.parent_task_id || seen.has(task.id)) return 0;
        seen.add(task.id);
        const parent = byId.get(task.parent_task_id);
        return parent ? 1 + depth(parent, seen) : 0;
    };
    return [...tasks].sort((a, b) => depth(a) - depth(b) || a.id - b.id);
}

async function createTask(user, attrs) {
    return Task.create({
        status: Task.STATUS.NOT_STARTED,
        priority: 0,
        ...attrs,
        name: attrs.name || '(untitled)',
        user_id: user.id,
    });
}

// Completing on Google: a recurring task moves on to its next occurrence,
// the same as ticking it in Tududi.
async function completeTask(task, user, timezone) {
    const oldStatus = task.status;
    const now = new Date();
    const occurrence = planOccurrenceAdvance(task, { timezone, now });
    if (occurrence?.hasNext) {
        await task.update({
            status: Task.STATUS.NOT_STARTED,
            completed_at: null,
            due_date: occurrence.nextDueDate,
        });
        await recordOccurrence(task, occurrence, user.id);
        return;
    }
    await task.update({ status: Task.STATUS.DONE, completed_at: now });
    await handleParentChildOnStatusChange(
        task,
        oldStatus,
        Task.STATUS.DONE,
        user.id
    );
}

async function reopenTask(task, user) {
    const oldStatus = task.status;
    await task.update({ status: Task.STATUS.NOT_STARTED, completed_at: null });
    await handleParentChildOnStatusChange(
        task,
        oldStatus,
        Task.STATUS.NOT_STARTED,
        user.id
    );
}

async function deleteTask(task) {
    const full = await Task.findByPk(task.id, {
        include: [{ model: TaskAttachment, as: 'Attachments' }],
    });
    if (!full) return;
    // Subtasks would be left pointing at nothing.
    await Task.update(
        { parent_task_id: null },
        { where: { parent_task_id: full.id } }
    );
    await destroyTaskRows(full);
}

async function findOrCreateProject(user, name) {
    const existing = await Project.findOne({
        where: { user_id: user.id, name },
    });
    if (existing) return existing;
    return Project.create({ user_id: user.id, name });
}

function taskUrl(task) {
    const base = (getConfig().frontendUrl || '').replace(/\/$/, '');
    return base && task.uid ? `${base}/task/${task.uid}` : '';
}

module.exports = {
    loadTasks,
    isSyncable,
    parentsFirst,
    createTask,
    completeTask,
    reopenTask,
    deleteTask,
    findOrCreateProject,
    taskUrl,
};

module.exports.isDone = (task) => Number(task.status) === Task.STATUS.DONE;

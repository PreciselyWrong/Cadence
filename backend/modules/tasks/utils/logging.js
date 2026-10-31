const { logError } = require('../../../services/logService');
const { Task } = require('../../../models');
const hlc = require('../../sync/hlc');
const { logTaskUpdate, logEvent } = require('../taskEventService');

function captureOldValues(task) {
    return {
        name: task.name,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        defer_until: task.defer_until,
        project_id: task.project_id,
        assigned_to: task.assigned_to,
        note: task.note,
        recurrence_type: task.recurrence_type,
        recurrence_interval: task.recurrence_interval,
        recurrence_end_date: task.recurrence_end_date,
        recurrence_weekday: task.recurrence_weekday,
        recurrence_month_day: task.recurrence_month_day,
        recurrence_week_of_month: task.recurrence_week_of_month,
        completion_based: task.completion_based,
        tags: task.Tags
            ? task.Tags.map((tag) => ({ id: tag.id, name: tag.name }))
            : [],
    };
}

const timeOf = (value) => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
};

// `options.source` says who wrote the change ('web' for the app, 'api' for
// an API key, 'import' for a spreadsheet); the review only counts the first
// two as the user's own postponements.
async function logTaskChanges(
    task,
    oldValues,
    reqBody,
    tagsData,
    userId,
    options = {}
) {
    const { source = 'web', skipDueDate = false } = options;
    try {
        const changes = {};
        const fields = [
            'name',
            'status',
            'priority',
            'project_id',
            'note',
            'recurrence_type',
            'recurrence_interval',
            'recurrence_end_date',
            'recurrence_weekday',
            'recurrence_month_day',
            'recurrence_week_of_month',
            'completion_based',
        ];

        fields.forEach((field) => {
            if (
                reqBody[field] !== undefined &&
                reqBody[field] !== oldValues[field]
            ) {
                changes[field] = {
                    oldValue: oldValues[field],
                    newValue: reqBody[field],
                };
            }
        });

        // Compare what is stored before and after, so a save that sends the
        // same due date again (or only a new time format) logs nothing.
        if (
            !skipDueDate &&
            (reqBody.due_date !== undefined || reqBody.due_time !== undefined)
        ) {
            const before = timeOf(oldValues.due_date);
            const after = timeOf(task.due_date);
            if (before !== after) {
                changes.due_date = {
                    oldValue: oldValues.due_date,
                    newValue: task.due_date,
                };
            }
        }

        if (reqBody.defer_until !== undefined) {
            const oldDeferStr = oldValues.defer_until
                ? oldValues.defer_until.toISOString()
                : null;
            const newDeferStr = reqBody.defer_until || null;

            if (oldDeferStr !== newDeferStr) {
                changes.defer_until = {
                    oldValue: oldValues.defer_until,
                    newValue: reqBody.defer_until,
                };
            }
        }

        if (Object.keys(changes).length > 0) {
            await logTaskUpdate(task.id, userId, changes, { source });
        }

        if (tagsData) {
            const newTags = tagsData.map((tag) => ({
                id: tag.id,
                name: tag.name,
            }));
            const oldTagNames = oldValues.tags.map((tag) => tag.name).sort();
            const newTagNames = newTags.map((tag) => tag.name).sort();

            if (JSON.stringify(oldTagNames) !== JSON.stringify(newTagNames)) {
                await logEvent({
                    taskId: task.id,
                    userId: userId,
                    eventType: 'tags_changed',
                    fieldName: 'tags',
                    oldValue: oldValues.tags,
                    newValue: newTags,
                    metadata: { source, action: 'tags_update' },
                });
            }
        }
    } catch (eventError) {
        logError('Error logging task update events:', eventError);
    }
}

const CLOSED_STATUSES = [
    Task.STATUS.DONE,
    Task.STATUS.ARCHIVED,
    Task.STATUS.CANCELLED,
];

// A due date pushed from one of the user's own devices through offline sync.
// It is logged like a change made in the app, at the moment the device made
// it (its clock), so the review reads it as the user's decision. Recurring
// tasks are left out: their dates also move when an occurrence is completed
// on the device, which is not a postponement.
async function logDeviceDueChange(task, previousDue, userId, hlcValue) {
    try {
        if (timeOf(previousDue) === timeOf(task.due_date)) return;
        if (task.habit_mode || task.recurring_parent_id) return;
        if (task.recurrence_type && task.recurrence_type !== 'none') return;
        if (CLOSED_STATUSES.includes(task.status)) return;

        const parsed = hlc.parse(hlcValue);
        const now = Date.now();
        const createdAt =
            parsed && parsed.ms <= now ? new Date(parsed.ms) : new Date(now);
        await logEvent({
            taskId: task.id,
            userId,
            eventType: 'due_date_changed',
            fieldName: 'due_date',
            oldValue: previousDue,
            newValue: task.due_date,
            metadata: { source: 'device', action: 'due_date_change' },
            createdAt,
        });
    } catch (error) {
        logError('Error logging device due date change:', error);
    }
}

module.exports = {
    captureOldValues,
    logTaskChanges,
    logDeviceDueChange,
};

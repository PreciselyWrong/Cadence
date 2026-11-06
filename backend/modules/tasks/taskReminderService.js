'use strict';

const { Op } = require('sequelize');
const { Task, Tag, User, Notification } = require('../../models');
const { logError } = require('../../services/logService');
const {
    shouldSendInAppNotification,
    shouldSendTelegramNotification,
    reminderSources,
} = require('../../utils/notificationPreferences');

const {
    MAX_LEAD_MINUTES,
    readTimedReminders,
} = require('../../utils/timedReminders');

const MINUTE_MS = 60 * 1000;
const MAX_LEAD_MS = MAX_LEAD_MINUTES * MINUTE_MS;

// Same catch-up as the phone: a server that was down longer stays silent.
const TIMED_CATCH_UP_MS = 15 * 60 * 1000;

const OPEN_STATUS = {
    [Op.notIn]: [Task.STATUS.DONE, Task.STATUS.ARCHIVED, Task.STATUS.CANCELLED],
};

// Sends each task reminder once, at or after its reminder_at time.
async function checkTaskReminders(now = new Date()) {
    const tasks = await Task.findAll({
        where: {
            reminder_at: { [Op.not]: null, [Op.lte]: now },
            reminder_sent_at: null,
            status: OPEN_STATUS,
        },
        include: [
            {
                model: User,
                attributes: [
                    'id',
                    'notification_preferences',
                    'telegram_bot_token',
                    'telegram_chat_id',
                ],
            },
        ],
    });

    let sent = 0;
    for (const task of tasks) {
        try {
            const user = task.User;
            if (!user) continue;

            // Mark first so a failing notification is not retried every minute.
            await task.update({ reminder_sent_at: now });

            const inApp = shouldSendInAppNotification(user, 'task_reminder');
            const telegram =
                !!(user.telegram_bot_token && user.telegram_chat_id) &&
                shouldSendTelegramNotification(user, 'task_reminder');
            const sources = [
                ...(telegram ? ['telegram'] : []),
                ...reminderSources(user, 'task_reminder'),
            ];

            // External channels do not depend on the in-app one.
            if (!inApp && sources.length === 0) continue;

            const notification = await Notification.createNotification({
                userId: user.id,
                type: 'reminder',
                title: 'Task reminder',
                message: `Reminder: "${task.name}"`,
                sources,
                data: {
                    taskUid: task.uid,
                    taskName: task.name,
                    reason: 'task_reminder',
                },
                sentAt: now,
            });
            // The row carries the delivery; with in-app off it must not
            // raise the badge. The desktop client reads unread rows only.
            if (!inApp && !sources.includes('desktop')) {
                await notification.markAsRead();
            }
            sent++;
        } catch (error) {
            logError(`Error sending reminder for task ${task.id}:`, error);
        }
    }

    return { remindersSent: sent };
}

// A task with a due time and no explicit reminder rings once at that time,
// ahead by the lead shared with the phone, with the same channels as a
// reminder. Same exclusions as the phone.
async function checkTimedTasks(now = new Date()) {
    const since = new Date(now.getTime() - TIMED_CATCH_UP_MS);
    const tasks = await Task.findAll({
        where: {
            due_has_time: true,
            due_date: {
                [Op.gt]: since,
                [Op.lte]: new Date(now.getTime() + MAX_LEAD_MS),
            },
            reminder_at: null,
            status: OPEN_STATUS,
            [Op.or]: [
                { defer_until: null },
                { defer_until: { [Op.lte]: now } },
            ],
        },
        include: [
            {
                model: User,
                attributes: [
                    'id',
                    'notification_preferences',
                    'ui_settings',
                    'telegram_bot_token',
                    'telegram_chat_id',
                ],
            },
            { model: Tag, attributes: ['name'], through: { attributes: [] } },
        ],
    });
    if (tasks.length === 0) return { remindersSent: 0 };

    // Read and dismissed rows count too: a due date rings only once, even
    // when the lead changes after it rang.
    const recent = await Notification.findAll({
        where: {
            user_id: { [Op.in]: [...new Set(tasks.map((t) => t.user_id))] },
            type: 'reminder',
            created_at: { [Op.gte]: new Date(since.getTime() - MAX_LEAD_MS) },
        },
    });
    const rung = new Set(
        recent
            .filter((n) => n.data?.reason === 'timed_task')
            .map((n) => `${n.data.taskUid}|${n.data.dueDate}`)
    );

    let sent = 0;
    for (const task of tasks) {
        try {
            const dueDate = new Date(task.due_date).toISOString();
            if (!task.User || rung.has(`${task.uid}|${dueDate}`)) continue;
            if (task.Tags.some((tag) => tag.name === 'someday')) continue;

            const user = task.User;
            const setting = readTimedReminders(user.ui_settings);
            if (!setting.enabled) continue;
            const ringAt =
                new Date(task.due_date).getTime() -
                setting.lead_minutes * MINUTE_MS;
            if (ringAt > now.getTime() || ringAt <= since.getTime()) continue;

            const inApp = shouldSendInAppNotification(user, 'task_reminder');
            const telegram =
                !!(user.telegram_bot_token && user.telegram_chat_id) &&
                shouldSendTelegramNotification(user, 'task_reminder');
            const sources = [
                ...(telegram ? ['telegram'] : []),
                ...reminderSources(user, 'task_reminder'),
            ];
            if (!inApp && sources.length === 0) continue;

            const notification = await Notification.createNotification({
                userId: user.id,
                type: 'reminder',
                title: 'Task reminder',
                message: `Reminder: "${task.name}"`,
                sources,
                data: {
                    taskUid: task.uid,
                    taskName: task.name,
                    dueDate,
                    reason: 'timed_task',
                },
                sentAt: now,
            });
            if (!inApp && !sources.includes('desktop')) {
                await notification.markAsRead();
            }
            sent++;
        } catch (error) {
            logError(
                `Error sending timed reminder for task ${task.id}:`,
                error
            );
        }
    }

    return { remindersSent: sent };
}

module.exports = { checkTaskReminders, checkTimedTasks };

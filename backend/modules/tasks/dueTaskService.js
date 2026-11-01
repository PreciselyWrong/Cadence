const { Task, Notification, User } = require('../../models');
const { Op } = require('sequelize');
const { logError } = require('../../services/logService');
const {
    shouldSendInAppNotification,
    shouldSendTelegramNotification,
    reminderSources,
} = require('../../utils/notificationPreferences');
const { getQuietUntil } = require('../../utils/quietHours');
const telegramPoller = require('../telegram/telegramPoller');

const DAY_MS = 24 * 60 * 60 * 1000;

// Due soon is the only due-date reminder: one notification per task per due
// date, refreshed in place while it is unread. Overdue tasks are never
// announced; they simply stay in the lists.
async function checkDueTasks() {
    try {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + DAY_MS);
        const lookBack = new Date(now.getTime() - 3 * DAY_MS);

        const dueTasks = await Task.findAll({
            where: {
                due_date: {
                    [Op.not]: null,
                    [Op.gt]: now,
                    [Op.lte]: tomorrow,
                },
                status: {
                    [Op.notIn]: [
                        Task.STATUS.DONE,
                        Task.STATUS.ARCHIVED,
                        Task.STATUS.CANCELLED,
                    ],
                },
            },
            include: [
                {
                    model: User,
                    attributes: [
                        'id',
                        'email',
                        'name',
                        'timezone',
                        'quiet_hours',
                        'notification_preferences',
                        'telegram_bot_token',
                        'telegram_chat_id',
                    ],
                },
            ],
        });

        if (dueTasks.length === 0) {
            return {
                success: true,
                tasksProcessed: 0,
                notificationsCreated: 0,
            };
        }

        // Batch-fetch all relevant notifications in one query to avoid N+1
        const userIds = [...new Set(dueTasks.map((t) => t.user_id))];
        const recentNotifications = await Notification.findAll({
            where: {
                user_id: { [Op.in]: userIds },
                type: 'task_due_soon',
                created_at: { [Op.gte]: lookBack },
            },
            order: [['created_at', 'DESC']],
        });
        const notificationsByUser = {};
        for (const notif of recentNotifications) {
            if (notif.data?.reason) continue;
            if (!notificationsByUser[notif.user_id]) {
                notificationsByUser[notif.user_id] = [];
            }
            notificationsByUser[notif.user_id].push(notif);
        }

        const tasksByUser = {};
        for (const task of dueTasks) {
            if (!tasksByUser[task.user_id]) {
                tasksByUser[task.user_id] = { user: task.User, tasks: [] };
            }
            tasksByUser[task.user_id].tasks.push(task);
        }

        let notificationsCreated = 0;

        for (const [userId, { user, tasks }] of Object.entries(tasksByUser)) {
            const wantsTelegram =
                !!(user.telegram_bot_token && user.telegram_chat_id) &&
                shouldSendTelegramNotification(user, 'task_due_soon');
            // During quiet hours Telegram goes through the held-delivery
            // path instead of the immediate batch.
            const holdTelegram = wantsTelegram && !!getQuietUntil(user, now);

            const dueSoonForTelegram = [];

            for (const task of tasks) {
                try {
                    if (!shouldSendInAppNotification(user, 'task_due_soon')) {
                        continue;
                    }

                    const dueDate = new Date(task.due_date);
                    const { title, message } = generateNotificationContent(
                        task.name,
                        dueDate,
                        now
                    );
                    const data = {
                        taskUid: task.uid,
                        taskName: task.name,
                        dueDate: task.due_date,
                    };

                    const existing = (
                        notificationsByUser[task.user_id] || []
                    ).find((notif) => notif.data?.taskUid === task.uid);

                    if (existing) {
                        const sameDueDate =
                            new Date(existing.data.dueDate).getTime() ===
                            dueDate.getTime();
                        const open =
                            !existing.read_at && !existing.dismissed_at;

                        if (open) {
                            if (!sameDueDate || existing.message !== message) {
                                await existing.update({
                                    title,
                                    message,
                                    data: sameDueDate ? existing.data : data,
                                });
                            }
                            continue;
                        }
                        if (sameDueDate) continue;
                    }

                    const notification = await Notification.createNotification({
                        userId: task.user_id,
                        type: 'task_due_soon',
                        title,
                        message,
                        level: 'warning',
                        sources: [
                            ...(holdTelegram ? ['telegram'] : []),
                            ...reminderSources(user, 'task_due_soon'),
                        ],
                        data,
                        sentAt: new Date(),
                    });

                    notificationsCreated++;

                    if (wantsTelegram && !holdTelegram) {
                        dueSoonForTelegram.push({ task, notification });
                    }
                } catch (error) {
                    logError(
                        `Error creating notification for task ${task.id}:`,
                        error
                    );
                }
            }

            if (dueSoonForTelegram.length > 0) {
                await sendBatchedTaskTelegramMessage(user, dueSoonForTelegram);
            }
        }

        return {
            success: true,
            tasksProcessed: dueTasks.length,
            notificationsCreated,
        };
    } catch (error) {
        logError('Error checking due tasks:', error);
        throw error;
    }
}

async function sendBatchedTaskTelegramMessage(user, dueSoonItems) {
    try {
        const parts = ['Due soon:'];
        for (const { task } of dueSoonItems) {
            parts.push(`• ${task.name}`);
        }

        await telegramPoller.sendTelegramMessage(
            user.telegram_bot_token,
            user.telegram_chat_id,
            parts.join('\n')
        );

        for (const { notification } of dueSoonItems) {
            await notification.markChannelAsSent('telegram');
        }
    } catch (error) {
        logError('Error sending batched Telegram task message:', error);
    }
}

function generateNotificationContent(taskName, dueDate, now) {
    const hoursUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60));
    const title = 'Task due soon';
    let message;

    if (hoursUntilDue < 1) {
        message = `Your task "${taskName}" is due in less than 1 hour`;
    } else if (hoursUntilDue < 24) {
        message = `Your task "${taskName}" is due in ${hoursUntilDue} hours`;
    } else {
        message = `Your task "${taskName}" is due tomorrow`;
    }

    return { title, message };
}

module.exports = {
    checkDueTasks,
};

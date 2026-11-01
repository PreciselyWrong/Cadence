const { Project, Notification, User } = require('../../models');
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

// Due soon is the only due-date reminder: one notification per project per due
// date, refreshed in place while it is unread. Overdue projects are never
// announced; they simply stay in the lists.
async function checkDueProjects() {
    try {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + DAY_MS);
        const lookBack = new Date(now.getTime() - 3 * DAY_MS);

        const dueProjects = await Project.findAll({
            where: {
                due_date_at: {
                    [Op.not]: null,
                    [Op.gt]: now,
                    [Op.lte]: tomorrow,
                },
                status: {
                    [Op.notIn]: ['done', 'cancelled', 'paused', 'archived'],
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

        if (dueProjects.length === 0) {
            return {
                success: true,
                projectsProcessed: 0,
                notificationsCreated: 0,
            };
        }

        // Batch-fetch all relevant notifications in one query to avoid N+1
        const userIds = [...new Set(dueProjects.map((p) => p.user_id))];
        const recentNotifications = await Notification.findAll({
            where: {
                user_id: { [Op.in]: userIds },
                type: 'project_due_soon',
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

        const projectsByUser = {};
        for (const project of dueProjects) {
            if (!projectsByUser[project.user_id]) {
                projectsByUser[project.user_id] = {
                    user: project.User,
                    projects: [],
                };
            }
            projectsByUser[project.user_id].projects.push(project);
        }

        let notificationsCreated = 0;

        for (const [userId, { user, projects }] of Object.entries(
            projectsByUser
        )) {
            const wantsTelegram =
                !!(user.telegram_bot_token && user.telegram_chat_id) &&
                shouldSendTelegramNotification(user, 'project_due_soon');
            // During quiet hours Telegram goes through the held-delivery
            // path instead of the immediate batch.
            const holdTelegram = wantsTelegram && !!getQuietUntil(user, now);

            const dueSoonForTelegram = [];

            for (const project of projects) {
                try {
                    if (
                        !shouldSendInAppNotification(user, 'project_due_soon')
                    ) {
                        continue;
                    }

                    const dueDate = new Date(project.due_date_at);
                    const { title, message } = generateNotificationContent(
                        project.name,
                        dueDate,
                        now
                    );
                    const data = {
                        projectUid: project.uid,
                        projectName: project.name,
                        dueDate: project.due_date_at,
                    };

                    const existing = (
                        notificationsByUser[project.user_id] || []
                    ).find((notif) => notif.data?.projectUid === project.uid);

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
                        userId: project.user_id,
                        type: 'project_due_soon',
                        title,
                        message,
                        level: 'warning',
                        sources: [
                            ...(holdTelegram ? ['telegram'] : []),
                            ...reminderSources(user, 'project_due_soon'),
                        ],
                        data,
                        sentAt: new Date(),
                    });

                    notificationsCreated++;

                    if (wantsTelegram && !holdTelegram) {
                        dueSoonForTelegram.push({ project, notification });
                    }
                } catch (error) {
                    logError(
                        `Error creating notification for project ${project.id}:`,
                        error
                    );
                }
            }

            if (dueSoonForTelegram.length > 0) {
                await sendBatchedProjectTelegramMessage(
                    user,
                    dueSoonForTelegram
                );
            }
        }

        return {
            success: true,
            projectsProcessed: dueProjects.length,
            notificationsCreated,
        };
    } catch (error) {
        logError('Error checking due projects:', error);
        throw error;
    }
}

async function sendBatchedProjectTelegramMessage(user, dueSoonItems) {
    try {
        const parts = ['Projects due soon:'];
        for (const { project } of dueSoonItems) {
            parts.push(`• ${project.name}`);
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
        logError('Error sending batched Telegram project message:', error);
    }
}

function generateNotificationContent(projectName, dueDate, now) {
    const hoursUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60));
    const title = 'Project due soon';
    let message;

    if (hoursUntilDue < 1) {
        message = `Your project "${projectName}" is due in less than 1 hour`;
    } else if (hoursUntilDue < 24) {
        message = `Your project "${projectName}" is due in ${hoursUntilDue} hours`;
    } else {
        message = `Your project "${projectName}" is due tomorrow`;
    }

    return { title, message };
}

module.exports = {
    checkDueProjects,
};

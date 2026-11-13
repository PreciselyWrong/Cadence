'use strict';

// « N mails à trier » (docs/43-mail-triage.md): once a burst of mail cards is
// over, the user gets one notification with how many still wait for a
// decision. Each card that is created or reopened restarts the quiet period.
const { MailItem, Notification } = require('../../models');
const { logError } = require('../../services/logService');

const MAIL_READY_DELAY_MS = 2 * 60 * 1000;

const timers = new Map();
const running = new Set();

const titleOf = (count) =>
    count === 1 ? '1 mail à trier' : `${count} mails à trier`;

async function announce(userId) {
    const count = await MailItem.count({
        where: { user_id: userId, status: 'pending' },
    });
    if (count === 0) return;
    const unread = await Notification.findAll({
        where: {
            user_id: userId,
            type: 'mail_ready',
            read_at: null,
            dismissed_at: null,
        },
    });
    for (const notification of unread) await notification.dismiss();
    await Notification.createNotification({
        userId,
        type: 'mail_ready',
        title: titleOf(count),
        level: 'info',
        data: { kind: 'mail_ready', count },
        sources: ['desktop', 'mobile'],
    });
}

function scheduleMailReady(userId) {
    clearTimeout(timers.get(userId));
    const timer = setTimeout(() => {
        timers.delete(userId);
        const job = announce(userId).catch((error) =>
            logError({ error, userId }, 'Mail ready notification failed')
        );
        running.add(job);
        job.finally(() => running.delete(job));
    }, MAIL_READY_DELAY_MS);
    timer.unref();
    timers.set(userId, timer);
}

// Resolves once the announcements already started have finished.
const idle = () => Promise.all([...running]);

module.exports = { MAIL_READY_DELAY_MS, scheduleMailReady, idle };

'use strict';

// « N décisions à prendre » (docs/49-agent-decisions.md): once a burst of
// decision cards is over, the user gets one notification with how many still
// wait for a decision. Each card created or reopened restarts the quiet period.
const { AgentDecision, Notification } = require('../../models');
const { logError } = require('../../services/logService');

const DECISIONS_READY_DELAY_MS = 2 * 60 * 1000;

const timers = new Map();
const running = new Set();

const titleOf = (count) =>
    count === 1 ? '1 décision à prendre' : `${count} décisions à prendre`;

async function announce(userId) {
    const count = await AgentDecision.count({
        where: { user_id: userId, status: 'pending' },
    });
    if (count === 0) return;
    const unread = await Notification.findAll({
        where: {
            user_id: userId,
            type: 'decisions_ready',
            read_at: null,
            dismissed_at: null,
        },
    });
    for (const notification of unread) await notification.dismiss();
    await Notification.createNotification({
        userId,
        type: 'decisions_ready',
        title: titleOf(count),
        level: 'info',
        data: {
            kind: 'decisions_ready',
            count,
            openPath: '/triage?deck=decisions',
        },
        sources: ['desktop', 'mobile'],
    });
}

function scheduleDecisionsReady(userId) {
    clearTimeout(timers.get(userId));
    const timer = setTimeout(() => {
        timers.delete(userId);
        const job = announce(userId).catch((error) =>
            logError({ error, userId }, 'Decisions ready notification failed')
        );
        running.add(job);
        job.finally(() => running.delete(job));
    }, DECISIONS_READY_DELAY_MS);
    timer.unref();
    timers.set(userId, timer);
}

// Resolves once the announcements already started have finished.
const idle = () => Promise.all([...running]);

module.exports = { DECISIONS_READY_DELAY_MS, scheduleDecisionsReady, idle };

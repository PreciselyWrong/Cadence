'use strict';

const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Habit, HabitReminder, Notification, User } = require('../../../models');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const { logError } = require('../../../services/logService');
const {
    shouldSendInAppNotification,
    shouldSendTelegramNotification,
    reminderSources,
} = require('../../../utils/notificationPreferences');
const engine = require('./index');
const { loadBundles, engineInputs } = require('./operations/read');

// A reminder is sent when the scheduler tick falls within this many minutes
// after its time. A server that was down for longer misses it rather than
// ringing a morning reminder in the evening.
const LOOKBACK_MINUTES = 10;

const dayNames = (value) =>
    String(value ?? '')
        .split(',')
        .filter((name) => name !== '');

// The local time of the reminder is reached, and not by more than the
// look-back; its weekday matches (empty means every day).
function isDueNow(reminder, now, timezone, date) {
    const days = dayNames(reminder.days_of_week);
    if (days.length > 0 && !days.includes(engine.dates.dayOfWeekName(date))) {
        return false;
    }
    const scheduled = moment.tz(
        `${date} ${reminder.time}`,
        'YYYY-MM-DD HH:mm',
        timezone
    );
    const lateMs = now.getTime() - scheduled.valueOf();
    return lateMs >= 0 && lateMs < LOOKBACK_MINUTES * 60 * 1000;
}

// Mirrors the phone: a paused habit stays silent, a conditional reminder
// rings only while the period still needs attention, any other one on the
// days the habit is planned.
function shouldRing(reminder, evaluation) {
    if (evaluation.isPaused) return false;
    return reminder.conditional
        ? evaluation.needsAttentionNow
        : evaluation.isPlannedForDate;
}

async function alreadySentToday(userId, now, date) {
    const recent = await Notification.findAll({
        where: {
            user_id: userId,
            type: 'reminder',
            created_at: {
                [Op.gte]: new Date(now.getTime() - 36 * 3600 * 1000),
            },
        },
        attributes: ['data'],
    });
    return new Set(
        recent
            .map((row) => row.data)
            .filter(
                (data) =>
                    data?.reason === 'habit_reminder' && data.date === date
            )
            .map((data) => data.reminderUid)
    );
}

async function notify(user, habit, reminder, date, now) {
    const inApp = shouldSendInAppNotification(user, 'habit_reminder');
    const telegram =
        !!(user.telegram_bot_token && user.telegram_chat_id) &&
        shouldSendTelegramNotification(user, 'habit_reminder');
    const sources = [
        ...(telegram ? ['telegram'] : []),
        ...reminderSources(user, 'habit_reminder'),
    ];
    // External channels do not depend on the in-app one.
    if (!inApp && sources.length === 0) return false;

    const notification = await Notification.createNotification({
        userId: user.id,
        type: 'reminder',
        title: 'Habitude',
        message: `Rappel : ${habit.name}`,
        sources,
        data: {
            habitUid: habit.uid,
            habitName: habit.name,
            reminderUid: reminder.uid,
            date,
            reason: 'habit_reminder',
        },
        sentAt: now,
    });
    // The row carries the delivery; with in-app off it must not raise the
    // badge. The desktop client reads unread rows only.
    if (!inApp && !sources.includes('desktop')) {
        await notification.markAsRead();
    }
    return true;
}

// Creates the `habit_reminder` notification of every reminder due now, once
// per reminder and local day. The phone also rings these reminders from its
// own alarms; the user's `habitReminders` preference decides what the server
// adds (in-app only by default).
async function checkHabitReminders(now = new Date()) {
    const reminders = await HabitReminder.findAll({ where: { enabled: true } });
    if (reminders.length === 0) return { remindersSent: 0 };

    const users = new Map(
        (
            await User.findAll({
                where: { id: [...new Set(reminders.map((r) => r.user_id))] },
                attributes: [
                    'id',
                    'timezone',
                    'notification_preferences',
                    'telegram_bot_token',
                    'telegram_chat_id',
                ],
            })
        ).map((user) => [user.id, user])
    );
    const habits = new Map(
        (
            await Habit.findAll({
                where: {
                    id: [...new Set(reminders.map((r) => r.habit_id))],
                    active: true,
                    archived: false,
                },
            })
        ).map((habit) => [habit.id, habit])
    );

    // Due now, by the clock of each user, and with a live habit.
    const due = [];
    for (const reminder of reminders) {
        const user = users.get(reminder.user_id);
        const habit = habits.get(reminder.habit_id);
        if (!user || !habit) continue;
        const timezone = getSafeTimezone(user.timezone);
        const date = moment(now).tz(timezone).format('YYYY-MM-DD');
        if (isDueNow(reminder, now, timezone, date)) {
            due.push({ reminder, user, habit, date });
        }
    }

    let sent = 0;
    const byUser = Map.groupBy(due, (item) => item.user.id);
    for (const [userId, items] of byUser) {
        try {
            const done = await alreadySentToday(userId, now, items[0].date);
            const { bundles } = await loadBundles(userId, [
                ...new Set(items.map((item) => item.habit)),
            ]);
            for (const { reminder, user, habit, date } of items) {
                if (done.has(reminder.uid)) continue;
                const { habitAt, entries, pauses } = engineInputs(
                    bundles.get(habit.id)
                );
                const rule = habitAt(date);
                if (!rule) continue;
                const evaluation = engine.evaluate(rule, date, entries, pauses);
                if (!shouldRing(reminder, evaluation)) continue;
                if (await notify(user, habit, reminder, date, now)) sent++;
            }
        } catch (error) {
            logError(
                `Error sending habit reminders for user ${userId}:`,
                error
            );
        }
    }

    return { remindersSent: sent };
}

module.exports = { checkHabitReminders, LOOKBACK_MINUTES };

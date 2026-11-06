const { Task, Notification, User } = require('../../../../models');
const {
    checkTaskReminders,
} = require('../../../../modules/tasks/taskReminderService');
const {
    applyDueTime,
    applyReminderAt,
} = require('../../../../modules/tasks/core/builders');
const {
    dueDateTimeToUTC,
    utcToUserTimeString,
} = require('../../../../utils/timezone-utils');
const bcrypt = require('bcrypt');

describe('due time', () => {
    describe('timezone helpers', () => {
        it('converts a local date and time to the matching UTC instant', () => {
            const utc = dueDateTimeToUTC(
                '2026-10-15',
                '15:30',
                'Europe/Athens'
            );
            expect(utc.toISOString()).toBe('2026-10-15T12:30:00.000Z');
        });

        it('returns null for a malformed time', () => {
            expect(dueDateTimeToUTC('2026-10-15', '25:99', 'UTC')).toBeNull();
        });

        it('formats the stored instant back as the user local time', () => {
            const utc = new Date('2026-10-15T12:30:00.000Z');
            expect(utcToUserTimeString(utc, 'Europe/Athens')).toBe('15:30');
        });
    });

    describe('applyDueTime', () => {
        const tz = 'Europe/Athens';

        it('sets a timed due date when due_date and due_time are given', () => {
            const attrs = {};
            applyDueTime(
                attrs,
                { due_date: '2026-10-15', due_time: '15:30' },
                tz
            );
            expect(attrs.due_has_time).toBe(true);
            expect(attrs.due_date.toISOString()).toBe(
                '2026-10-15T12:30:00.000Z'
            );
        });

        it('keeps end-of-day storage and clears the flag when the time is removed', () => {
            const attrs = { due_has_time: true };
            applyDueTime(
                attrs,
                { due_time: null },
                tz,
                new Date('2026-10-15T12:30:00.000Z')
            );
            expect(attrs.due_has_time).toBe(false);
            expect(utcToUserTimeString(attrs.due_date, tz)).toBe('23:59');
        });

        it('drops the time when only the date changes', () => {
            const attrs = {
                due_date: new Date('2026-10-16T20:59:59.999Z'),
                due_has_time: true,
            };
            applyDueTime(attrs, { due_date: '2026-10-16' }, tz);
            expect(attrs.due_has_time).toBe(false);
        });

        it('keeps the existing day when only the time changes', () => {
            const attrs = {};
            applyDueTime(
                attrs,
                { due_time: '09:00' },
                tz,
                new Date('2026-10-15T12:30:00.000Z')
            );
            expect(attrs.due_has_time).toBe(true);
            expect(utcToUserTimeString(attrs.due_date, tz)).toBe('09:00');
        });

        it('rejects a time that is not HH:mm', () => {
            expect(() =>
                applyDueTime(
                    {},
                    { due_date: '2026-10-15', due_time: '3pm' },
                    tz
                )
            ).toThrow('due_time must be in HH:mm format');
        });
    });

    describe('applyReminderAt', () => {
        it('re-arms the reminder when a new time is set', () => {
            const attrs = { reminder_sent_at: new Date() };
            applyReminderAt(attrs, { reminder_at: '2026-10-15T10:00:00Z' });
            expect(attrs.reminder_at).toEqual(new Date('2026-10-15T10:00:00Z'));
            expect(attrs.reminder_sent_at).toBeNull();
        });

        it('rejects an invalid date-time', () => {
            expect(() => applyReminderAt({}, { reminder_at: 'soon' })).toThrow(
                'reminder_at must be a valid date-time'
            );
        });
    });

    describe('checkTaskReminders', () => {
        let user;

        beforeEach(async () => {
            user = await User.create({
                email: 'reminder@example.com',
                password_digest: await bcrypt.hash('password123', 10),
            });
        });

        it('sends a reminder once when reminder_at has passed', async () => {
            const now = new Date('2026-10-15T10:00:00Z');
            const task = await Task.create({
                name: 'Call the bank',
                user_id: user.id,
                reminder_at: new Date('2026-10-15T09:59:00Z'),
            });

            const first = await checkTaskReminders(now);
            const second = await checkTaskReminders(now);

            expect(first.remindersSent).toBe(1);
            expect(second.remindersSent).toBe(0);

            const reloaded = await Task.findByPk(task.id);
            expect(reloaded.reminder_sent_at).not.toBeNull();

            const notifications = await Notification.findAll({
                where: { user_id: user.id, type: 'reminder' },
            });
            expect(notifications).toHaveLength(1);
        });

        it('delivers on external channels even when in-app is off', async () => {
            const pushService = require('../../../../modules/push/service');
            const pushSpy = jest
                .spyOn(pushService, 'sendNotification')
                .mockResolvedValue(1);
            await user.update({
                notification_preferences: {
                    taskReminders: { inApp: false, push: true, desktop: false },
                },
            });
            await Task.create({
                name: 'Phone rings',
                user_id: user.id,
                reminder_at: new Date('2026-10-15T09:59:00Z'),
            });

            const result = await checkTaskReminders(
                new Date('2026-10-15T10:00:00Z')
            );

            expect(result.remindersSent).toBe(1);
            expect(pushSpy).toHaveBeenCalledTimes(1);
            const [notification] = await Notification.findAll({
                where: { user_id: user.id, type: 'reminder' },
            });
            expect(notification.read_at).not.toBeNull();
            pushSpy.mockRestore();
        });

        it('sends nothing when every channel is off', async () => {
            await user.update({
                notification_preferences: {
                    taskReminders: { inApp: false, desktop: false },
                },
            });
            await Task.create({
                name: 'Silent',
                user_id: user.id,
                reminder_at: new Date('2026-10-15T09:59:00Z'),
            });

            const result = await checkTaskReminders(
                new Date('2026-10-15T10:00:00Z')
            );

            expect(result.remindersSent).toBe(0);
        });

        // reminder_sent_at is the job's own bookkeeping ("this reminder_at was
        // handled"), not "the user was notified": it is stamped even when no
        // channel sent anything, and the phone never reads it (it rings task
        // reminders itself, docs/36-notifications.md).
        it('stamps reminder_sent_at as handled even when nothing was sent', async () => {
            await user.update({
                notification_preferences: {
                    taskReminders: { inApp: false, desktop: false },
                },
            });
            const task = await Task.create({
                name: 'Phone only',
                user_id: user.id,
                reminder_at: new Date('2026-10-15T09:59:00Z'),
            });
            const now = new Date('2026-10-15T10:00:00Z');

            await checkTaskReminders(now);

            await task.reload();
            expect(task.reminder_sent_at.toISOString()).toBe(now.toISOString());
            expect(
                await Notification.count({ where: { user_id: user.id } })
            ).toBe(0);
        });

        it('rings on the desktop too, unless turned off', async () => {
            await Task.create({
                name: 'Both ring',
                user_id: user.id,
                reminder_at: new Date('2026-10-15T09:59:00Z'),
            });
            await checkTaskReminders(new Date('2026-10-15T10:00:00Z'));
            let [notification] = await Notification.findAll({
                where: { user_id: user.id, type: 'reminder' },
            });
            expect(notification.sources).toContain('desktop');

            await Notification.destroy({ where: { user_id: user.id } });
            await user.update({
                notification_preferences: {
                    taskReminders: { inApp: true, desktop: false },
                },
            });
            await Task.update(
                { reminder_sent_at: null },
                { where: { user_id: user.id } }
            );
            await checkTaskReminders(new Date('2026-10-15T10:00:00Z'));
            [notification] = await Notification.findAll({
                where: { user_id: user.id, type: 'reminder' },
            });
            expect(notification.sources).not.toContain('desktop');
        });

        it('does not send for a reminder in the future', async () => {
            await Task.create({
                name: 'Later',
                user_id: user.id,
                reminder_at: new Date('2026-10-15T12:00:00Z'),
            });

            const result = await checkTaskReminders(
                new Date('2026-10-15T10:00:00Z')
            );
            expect(result.remindersSent).toBe(0);
        });
    });
});

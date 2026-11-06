const { Task, Tag, Notification, User } = require('../../../../models');
const {
    checkTimedTasks,
} = require('../../../../modules/tasks/taskReminderService');
const bcrypt = require('bcrypt');

const MINUTE = 60 * 1000;

describe('checkTimedTasks', () => {
    let user;
    let now;

    beforeEach(async () => {
        now = new Date();
        user = await User.create({
            email: 'timed@example.com',
            password_digest: await bcrypt.hash('password123', 10),
        });
    });

    const createTask = (overrides = {}) =>
        Task.create({
            name: 'Sport',
            user_id: user.id,
            due_date: new Date(now.getTime() - MINUTE),
            due_has_time: true,
            status: Task.STATUS.NOT_STARTED,
            ...overrides,
        });

    const rings = () =>
        Notification.findAll({ where: { user_id: user.id, type: 'reminder' } });

    it('rings once on the desktop when the due time is reached', async () => {
        const task = await createTask();

        await checkTimedTasks(now);
        await checkTimedTasks(now);

        const [ring, ...others] = await rings();
        expect(others).toHaveLength(0);
        expect(ring.sources).toContain('desktop');
        expect(ring.data.taskUid).toBe(task.uid);
        expect(ring.data.reason).toBe('timed_task');
    });

    it('does not ring again once the notification is read', async () => {
        await createTask();
        await checkTimedTasks(now);
        const [ring] = await rings();
        await ring.markAsRead();

        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(1);
    });

    it('rings for the next due date of the same task', async () => {
        const task = await createTask();
        await checkTimedTasks(now);

        await task.update({ due_date: new Date(now.getTime() - 2 * MINUTE) });
        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(2);
    });

    it.each([
        ['before its time', { due_date: new Date(Date.now() + 60 * MINUTE) }],
        ['too long after', { due_date: new Date(Date.now() - 16 * MINUTE) }],
        ['without a due time', { due_has_time: false }],
        [
            'with its own reminder',
            { reminder_at: new Date(Date.now() + MINUTE) },
        ],
        ['when done', { status: Task.STATUS.DONE }],
        ['while deferred', { defer_until: new Date(Date.now() + 60 * MINUTE) }],
    ])('stays silent %s', async (_label, overrides) => {
        await createTask(overrides);
        await checkTimedTasks(now);
        expect(await rings()).toHaveLength(0);
    });

    it('stays silent for a Plus tard task', async () => {
        const task = await createTask();
        const [tag] = await Tag.findOrCreate({
            where: { user_id: user.id, name: 'someday' },
            defaults: { name: 'someday', user_id: user.id, tag_type: 'system' },
        });
        await task.addTag(tag);

        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(0);
    });

    const useSetting = (timedReminders) =>
        user.update({ ui_settings: { timedReminders } });

    it('rings ahead by the shared lead', async () => {
        await useSetting({ enabled: true, lead_minutes: 10 });
        await createTask({ due_date: new Date(now.getTime() + 9 * MINUTE) });

        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(1);
    });

    it('waits until the shared lead is reached', async () => {
        await useSetting({ enabled: true, lead_minutes: 10 });
        await createTask({ due_date: new Date(now.getTime() + 11 * MINUTE) });

        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(0);
    });

    it('does not ring twice when the lead changes', async () => {
        await useSetting({ enabled: true, lead_minutes: 30 });
        await createTask({ due_date: new Date(now.getTime() + 20 * MINUTE) });
        await checkTimedTasks(now);

        await useSetting({ enabled: true, lead_minutes: 0 });
        await checkTimedTasks(new Date(now.getTime() + 21 * MINUTE));

        expect(await rings()).toHaveLength(1);
    });

    it('stays silent when the shared setting is off', async () => {
        await useSetting({ enabled: false, lead_minutes: 0 });
        await createTask();

        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(0);
    });

    it('respects the task reminder channels', async () => {
        await user.update({
            notification_preferences: {
                taskReminders: { inApp: false, desktop: false },
            },
        });
        await createTask();

        await checkTimedTasks(now);

        expect(await rings()).toHaveLength(0);
    });
});

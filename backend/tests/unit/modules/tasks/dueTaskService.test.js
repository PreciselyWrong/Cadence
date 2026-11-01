const { Task, Notification, User } = require('../../../../models');
const { checkDueTasks } = require('../../../../modules/tasks/dueTaskService');
const telegramPoller = require('../../../../modules/telegram/telegramPoller');
const bcrypt = require('bcrypt');

const inHours = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

describe('dueTaskService', () => {
    let user;

    beforeEach(async () => {
        user = await User.create({
            email: 'test@example.com',
            password_digest: await bcrypt.hash('password123', 10),
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const createTask = (overrides = {}) =>
        Task.create({
            name: 'Test Task',
            user_id: user.id,
            due_date: inHours(20),
            status: Task.STATUS.NOT_STARTED,
            ...overrides,
        });

    const dueSoon = () =>
        Notification.findAll({
            where: { user_id: user.id, type: 'task_due_soon' },
        });

    describe('due soon', () => {
        it('notifies once for a task due within 24 hours', async () => {
            const task = await createTask();

            const first = await checkDueTasks();
            const second = await checkDueTasks();

            expect(first.notificationsCreated).toBe(1);
            expect(second.notificationsCreated).toBe(0);
            const notifications = await dueSoon();
            expect(notifications).toHaveLength(1);
            expect(notifications[0].data.taskUid).toBe(task.uid);
            expect(notifications[0].level).toBe('warning');
        });

        it('ignores tasks due later than 24 hours', async () => {
            await createTask({ due_date: inHours(40) });
            const result = await checkDueTasks();
            expect(result.notificationsCreated).toBe(0);
        });

        it('never creates an overdue notification', async () => {
            await createTask({ due_date: inHours(-30) });

            const result = await checkDueTasks();

            expect(result.notificationsCreated).toBe(0);
            expect(
                await Notification.count({ where: { user_id: user.id } })
            ).toBe(0);
        });

        it('does not notify for completed tasks', async () => {
            await createTask({ status: Task.STATUS.DONE });
            const result = await checkDueTasks();
            expect(result.notificationsCreated).toBe(0);
        });

        it('keeps the same row when the countdown text changes', async () => {
            const task = await createTask({ due_date: inHours(20) });
            await checkDueTasks();
            const [original] = await dueSoon();
            await Notification.update(
                { message: 'stale countdown' },
                { where: { id: original.id } }
            );

            await checkDueTasks();

            const notifications = await dueSoon();
            expect(notifications).toHaveLength(1);
            expect(notifications[0].id).toBe(original.id);
            expect(notifications[0].uid).toBe(original.uid);
            expect(notifications[0].created_at).toEqual(original.created_at);
            expect(notifications[0].message).toContain('hours');
            expect(notifications[0].data.taskUid).toBe(task.uid);
        });

        it('updates an unread notification in place when the due date moves', async () => {
            const task = await createTask({ due_date: inHours(20) });
            await checkDueTasks();
            const [original] = await dueSoon();

            await task.update({ due_date: inHours(5) });
            await checkDueTasks();

            const notifications = await dueSoon();
            expect(notifications).toHaveLength(1);
            expect(notifications[0].uid).toBe(original.uid);
            expect(new Date(notifications[0].data.dueDate).getTime()).toBe(
                task.due_date.getTime()
            );
        });

        it('does not bring back a read notification for the same due date', async () => {
            await createTask();
            await checkDueTasks();
            const [original] = await dueSoon();
            await original.markAsRead();

            const result = await checkDueTasks();

            expect(result.notificationsCreated).toBe(0);
            expect(await dueSoon()).toHaveLength(1);
        });

        it('does not bring back a dismissed notification', async () => {
            await createTask();
            await checkDueTasks();
            const [original] = await dueSoon();
            await original.dismiss();

            const result = await checkDueTasks();

            expect(result.notificationsCreated).toBe(0);
            expect(await dueSoon()).toHaveLength(1);
        });

        it('asks the desktop client to show it by default', async () => {
            await createTask();
            await checkDueTasks();
            const [notification] = await dueSoon();
            expect(notification.sources).toContain('desktop');
        });
    });

    describe('Telegram', () => {
        beforeEach(async () => {
            jest.spyOn(telegramPoller, 'sendTelegramMessage').mockResolvedValue(
                { ok: true }
            );
            await user.update({
                telegram_bot_token:
                    '123456789:ABCdefGHIjklMNOPQRSTUVwxyz-12345678',
                telegram_chat_id: '123456789',
                notification_preferences: {
                    dueTasks: { inApp: true, telegram: true },
                },
            });
        });

        it('sends one due-soon message and never repeats it', async () => {
            await createTask();

            await checkDueTasks();
            expect(telegramPoller.sendTelegramMessage).toHaveBeenCalledTimes(1);
            const text = telegramPoller.sendTelegramMessage.mock.calls[0][2];
            expect(text).toContain('Test Task');

            telegramPoller.sendTelegramMessage.mockClear();
            await checkDueTasks();
            expect(telegramPoller.sendTelegramMessage).not.toHaveBeenCalled();
        });

        it('sends nothing for an overdue task', async () => {
            await createTask({ due_date: inHours(-30) });
            await checkDueTasks();
            expect(telegramPoller.sendTelegramMessage).not.toHaveBeenCalled();
        });

        it('holds the Telegram message during quiet hours', async () => {
            await user.update({
                quiet_hours: { enabled: true, start: '00:00', end: '23:59' },
            });
            await createTask();

            await checkDueTasks();

            expect(telegramPoller.sendTelegramMessage).not.toHaveBeenCalled();
            const [notification] = await dueSoon();
            expect(notification.sources).toContain('telegram');
            expect(notification.deliver_after).not.toBeNull();
        });
    });
});

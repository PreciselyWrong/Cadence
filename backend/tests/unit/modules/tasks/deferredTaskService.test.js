const { Task, Notification, User } = require('../../../../models');
const {
    checkDeferredTasks,
} = require('../../../../modules/tasks/deferredTaskService');
const telegramPoller = require('../../../../modules/telegram/telegramPoller');
const bcrypt = require('bcrypt');

const inHours = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

describe('deferredTaskService', () => {
    let user;

    beforeEach(async () => {
        user = await User.create({
            email: 'deferred@example.com',
            password_digest: await bcrypt.hash('password123', 10),
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const createTask = (overrides = {}) =>
        Task.create({
            name: 'Wake up later',
            user_id: user.id,
            defer_until: inHours(-1),
            status: Task.STATUS.NOT_STARTED,
            ...overrides,
        });

    const rows = () => Notification.findAll({ where: { user_id: user.id } });

    it('announces a task once when its defer date is reached', async () => {
        await createTask();

        const first = await checkDeferredTasks();
        await Notification.update(
            { created_at: inHours(-30) },
            { where: { user_id: user.id } }
        );
        const second = await checkDeferredTasks();

        expect(first.notificationsCreated).toBe(1);
        expect(second.notificationsCreated).toBe(0);
        expect(await rows()).toHaveLength(1);
    });

    it('ignores a defer date that passed long ago', async () => {
        await createTask({ defer_until: inHours(-24 * 10) });
        const result = await checkDeferredTasks();
        expect(result.notificationsCreated).toBe(0);
    });

    it('asks the desktop client to show it by default', async () => {
        await createTask();
        await checkDeferredTasks();
        const [notification] = await rows();
        expect(notification.sources).toContain('desktop');
    });

    it('holds Telegram during quiet hours', async () => {
        jest.spyOn(telegramPoller, 'sendTelegramMessage').mockResolvedValue({
            ok: true,
        });
        await user.update({
            telegram_bot_token: '123456789:ABCdefGHIjklMNOPQRSTUVwxyz-12345678',
            telegram_chat_id: '123456789',
            notification_preferences: {
                deferUntil: { inApp: true, telegram: true },
            },
            quiet_hours: { enabled: true, start: '00:00', end: '23:59' },
        });
        await createTask();

        await checkDeferredTasks();

        expect(telegramPoller.sendTelegramMessage).not.toHaveBeenCalled();
        const [notification] = await rows();
        expect(notification.sources).toContain('telegram');
        expect(notification.deliver_after).not.toBeNull();
    });
});

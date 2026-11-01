const { Notification, User } = require('../../../models');
const pushService = require('../../../modules/push/service');
const bcrypt = require('bcrypt');

describe('Notification quiet hours', () => {
    let user;
    let pushSpy;

    beforeEach(async () => {
        pushSpy = jest.spyOn(pushService, 'sendNotification');
        pushSpy.mockResolvedValue(1);
        user = await User.create({
            email: 'quiet@example.com',
            password_digest: await bcrypt.hash('password123', 10),
            timezone: 'UTC',
            quiet_hours: { enabled: true, start: '00:00', end: '23:59' },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const create = (sources = ['push', 'desktop']) =>
        Notification.createNotification({
            userId: user.id,
            type: 'task_due_soon',
            title: 'Task due soon',
            message: 'Your task "A" is due tomorrow',
            sources,
        });

    it('stores the in-app notification at once but holds delivery until the window ends', async () => {
        const notification = await create();

        expect(notification.id).toBeDefined();
        expect(notification.sources).toEqual(['push', 'desktop']);
        expect(notification.deliver_after).toBeInstanceOf(Date);
        expect(notification.deliver_after.getTime()).toBeGreaterThan(
            Date.now()
        );
        expect(pushSpy).not.toHaveBeenCalled();
    });

    it('delivers immediately outside quiet hours', async () => {
        await user.update({ quiet_hours: null });
        const notification = await create();

        expect(notification.deliver_after).toBeNull();
        expect(pushSpy).toHaveBeenCalledTimes(1);
    });

    it('does not look up the user when there is nothing to deliver', async () => {
        const notification = await create([]);
        expect(notification.deliver_after).toBeNull();
    });

    it('sends held notifications once the window is over, and only once', async () => {
        const notification = await create(['push']);
        const later = new Date(notification.deliver_after.getTime() + 1000);

        const early = await Notification.flushDeferred(new Date());
        expect(early.delivered).toBe(0);
        expect(pushSpy).not.toHaveBeenCalled();

        const first = await Notification.flushDeferred(later);
        expect(first.delivered).toBe(1);
        expect(pushSpy).toHaveBeenCalledTimes(1);

        const second = await Notification.flushDeferred(later);
        expect(second.delivered).toBe(0);
        expect(pushSpy).toHaveBeenCalledTimes(1);

        await notification.reload();
        expect(notification.deliver_after).toBeNull();
    });

    it('accepts the desktop source', async () => {
        await user.update({ quiet_hours: null });
        const notification = await create(['desktop']);
        expect(notification.sources).toEqual(['desktop']);
    });
});

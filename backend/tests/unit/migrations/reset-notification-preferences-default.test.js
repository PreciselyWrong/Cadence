const { Sequelize } = require('sequelize');
const { sequelize, User } = require('../../../models');
const { setJsonColumnDefault } = require('../../../utils/db-dialect');
const migration = require('../../../migrations/20261101140000-reset-notification-preferences-default');

// The column default written by installs created while the model still
// listed `habitReminders` (and by the first Cadence build that dropped it).
const OLD_DEFAULT = {
    dueTasks: { inApp: true, email: false, push: false, telegram: false },
    habitReminders: { inApp: true, email: false, push: false, telegram: false },
};

describe('migration 20261101140000-reset-notification-preferences-default', () => {
    const qi = () => sequelize.getQueryInterface();

    const columnDefault = async () => {
        const info = await qi().describeTable('users');
        const raw = info.notification_preferences.defaultValue;
        return JSON.parse(
            String(raw).replace(/^'|'$/g, '').replace(/''/g, "'")
        );
    };

    afterAll(async () => {
        await sequelize.close();
    });

    it('replaces an old column default with the model default and keeps the data', async () => {
        await setJsonColumnDefault(
            qi(),
            'users',
            'notification_preferences',
            OLD_DEFAULT
        );
        expect(await columnDefault()).toEqual(OLD_DEFAULT);
        const stored = { dueTasks: { inApp: false, push: true } };
        const user = await User.create({
            email: 'prefs-default@example.com',
            password_digest: 'x',
            notification_preferences: stored,
        });

        await migration.up(qi(), Sequelize);

        const expected =
            User.rawAttributes.notification_preferences.defaultValue;
        expect(await columnDefault()).toEqual(expected);
        expect(expected.habitReminders).toBeUndefined();
        const reloaded = await User.findByPk(user.id);
        expect(reloaded.notification_preferences).toEqual(stored);
        expect(reloaded.email).toBe('prefs-default@example.com');
    });

    it('is idempotent and leaves the column nullable', async () => {
        await migration.up(qi(), Sequelize);
        await migration.up(qi(), Sequelize);

        const info = await qi().describeTable('users');
        expect(info.notification_preferences.allowNull).toBe(true);
    });
});

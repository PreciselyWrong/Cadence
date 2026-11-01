const { Sequelize } = require('sequelize');
const { sequelize } = require('../../../models');
const migration = require('../../../migrations/20261101160000-add-review-at-to-links');

describe('migration 20261101160000-add-review-at-to-links', () => {
    const qi = () => sequelize.getQueryInterface();
    const hasColumn = async () =>
        'review_at' in (await qi().describeTable('links'));

    afterAll(async () => {
        await migration.up(qi(), Sequelize);
        await sequelize.close();
    });

    it('starts from the model, which already has the column', async () => {
        await migration.up(qi(), Sequelize);

        expect(await hasColumn()).toBe(true);
    });

    it('adds the column back after it was removed', async () => {
        await migration.down(qi());
        expect(await hasColumn()).toBe(false);

        await migration.up(qi(), Sequelize);

        expect(await hasColumn()).toBe(true);
    });

    it('does nothing when the column is already there', async () => {
        await migration.up(qi(), Sequelize);
        const before = await qi().describeTable('links');

        await migration.up(qi(), Sequelize);

        expect(await qi().describeTable('links')).toEqual(before);
    });
});

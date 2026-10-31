const { Sequelize } = require('sequelize');
const { sequelize } = require('../../../models');
const migration = require('../../../migrations/20261031180000-add-icon-to-projects-and-tags');

describe('migration 20261031180000-add-icon-to-projects-and-tags', () => {
    const qi = () => sequelize.getQueryInterface();

    afterAll(async () => {
        await sequelize.close();
    });

    it('adds a nullable icon column to projects and tags, idempotently', async () => {
        await migration.up(qi(), Sequelize);
        await migration.up(qi(), Sequelize);

        for (const table of ['projects', 'tags']) {
            const info = await qi().describeTable(table);
            expect(info.icon).toBeDefined();
            expect(info.icon.allowNull).toBe(true);
        }
    });

    it('removes the icon columns on down', async () => {
        await migration.up(qi(), Sequelize);
        await migration.down(qi(), Sequelize);

        for (const table of ['projects', 'tags']) {
            const info = await qi().describeTable(table);
            expect(info.icon).toBeUndefined();
        }
        await migration.up(qi(), Sequelize);
    });
});

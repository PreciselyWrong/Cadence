const { Sequelize } = require('sequelize');
const { sequelize, Link } = require('../../../models');
const { createTestUser } = require('../../helpers/testUtils');
const migration = require('../../../migrations/20261107120000-links-two-statuses');

describe('migration 20261107120000-links-two-statuses', () => {
    const qi = () => sequelize.getQueryInterface();

    afterAll(async () => {
        await migration.up(qi(), Sequelize);
        await sequelize.close();
    });

    it('folds the former statuses into new and keeps new and dropped', async () => {
        const user = await createTestUser({
            email: 'two-statuses@example.com',
        });
        const before = [
            'to_evaluate',
            'tested',
            'kept',
            'parked',
            'new',
            'dropped',
        ];
        await Link.bulkCreate(
            before.map((status, index) => ({
                user_id: user.id,
                url: `https://example.com/statut/${index}`,
                kind: 'other',
                status,
            }))
        );

        await migration.up(qi(), Sequelize);

        const after = await Link.findAll({
            where: { user_id: user.id },
            order: [['id', 'ASC']],
        });
        expect(after.map((link) => link.status)).toEqual([
            'new',
            'new',
            'new',
            'new',
            'new',
            'dropped',
        ]);
    });

    it('does nothing when run again', async () => {
        const user = await createTestUser({
            email: 'two-statuses-again@example.com',
        });
        await Link.create({
            user_id: user.id,
            url: 'https://example.com/deja',
            kind: 'other',
            status: 'dropped',
        });

        await migration.up(qi(), Sequelize);
        await migration.up(qi(), Sequelize);

        const link = await Link.findOne({ where: { user_id: user.id } });
        expect(link.status).toBe('dropped');
    });
});

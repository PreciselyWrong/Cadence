'use strict';

const { Sequelize } = require('sequelize');
const { sequelize, MailItem, User } = require('../../../models');
const { createTestUser } = require('../../helpers/testUtils');
const { isPostgres } = require('../../../utils/db-dialect');
const migration = require('../../../migrations/20261120085719-widen-mail-summary');

const fields = (userId, thread = 'thread123') => ({
    user_id: userId,
    account: 'personal',
    thread_id: thread,
    received_at: new Date('2026-11-20T08:00:00Z'),
    summary: 'x'.repeat(500),
    gmail_url: `https://mail.google.com/mail/u/0/#inbox/${thread}`,
    status: 'pending',
});

describe('widen mail summaries', () => {
    it('preserves rows, indexes and references when applied twice', async () => {
        const user = await createTestUser();
        const qi = sequelize.getQueryInterface();
        if (isPostgres()) {
            await qi.changeColumn('mail_items', 'summary', {
                type: Sequelize.STRING(200),
                allowNull: false,
            });
        }
        const first = await MailItem.create({
            ...fields(user.id),
            summary: 'x'.repeat(200),
        });
        const indexes = await qi.showIndex('mail_items');
        const references =
            await qi.getForeignKeyReferencesForTable('mail_items');
        const columns = await qi.describeTable('mail_items');
        await migration.up(qi, Sequelize);
        await migration.up(qi, Sequelize);
        await first.update({ summary: 'x'.repeat(500) });
        expect(await qi.showIndex('mail_items')).toEqual(indexes);
        expect(await qi.getForeignKeyReferencesForTable('mail_items')).toEqual(
            references
        );
        expect(Object.keys(await qi.describeTable('mail_items'))).toEqual(
            Object.keys(columns)
        );
        expect((await first.reload()).summary).toBe('x'.repeat(500));
        await expect(MailItem.create(fields(user.id))).rejects.toThrow();
        const second = await MailItem.create(fields(user.id, 'thread456'));
        expect(second.id).toBeGreaterThan(first.id);
        await User.destroy({ where: { id: user.id } });
        expect(await MailItem.count()).toBe(0);
    });

    it('widens an existing PostgreSQL summary and skips a second run', async () => {
        let type = 'VARCHAR(200)';
        const qi = {
            sequelize: { getDialect: () => 'postgres' },
            showAllTables: jest.fn().mockResolvedValue(['mail_items']),
            describeTable: jest
                .fn()
                .mockImplementation(async () => ({ summary: { type } })),
            changeColumn: jest
                .fn()
                .mockImplementation(async (_table, _column, definition) => {
                    type = definition.type.toSql();
                }),
        };
        await migration.up(qi, Sequelize);
        await migration.up(qi, Sequelize);
        expect(qi.changeColumn).toHaveBeenCalledTimes(1);
        expect(type).toBe('VARCHAR(500)');
        expect(qi.changeColumn).toHaveBeenCalledWith('mail_items', 'summary', {
            type: Sequelize.STRING(500),
            allowNull: false,
        });
    });

    it('does not shrink saved summaries on rollback', async () => {
        const user = await createTestUser();
        const row = await MailItem.create(fields(user.id));
        await migration.down(sequelize.getQueryInterface(), Sequelize);
        expect((await row.reload()).summary).toBe('x'.repeat(500));
    });
});

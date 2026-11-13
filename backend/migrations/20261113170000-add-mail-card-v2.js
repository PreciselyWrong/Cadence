'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// The choices of a mail card, its draft, excerpt, note and the Gmail action
// asked for (docs/43-mail-triage.md, contract v2).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'mail_items', [
            {
                name: 'options',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
            {
                name: 'recommended',
                definition: { type: Sequelize.STRING(16), allowNull: true },
            },
            {
                name: 'draft',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
            {
                name: 'excerpt',
                definition: { type: Sequelize.TEXT, allowNull: true },
            },
            {
                name: 'note',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
            {
                name: 'action',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
            {
                name: 'action_error',
                definition: { type: Sequelize.STRING(64), allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        for (const column of [
            'action_error',
            'action',
            'note',
            'excerpt',
            'draft',
            'recommended',
            'options',
        ]) {
            await queryInterface.removeColumn('mail_items', column);
        }
    },
};

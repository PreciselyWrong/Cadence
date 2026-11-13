'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// The appointment a user accepts on a mail card, kept for the agent that puts
// it in the calendar (docs/43-mail-triage.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'mail_items', [
            {
                name: 'event',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('mail_items', 'event');
    },
};

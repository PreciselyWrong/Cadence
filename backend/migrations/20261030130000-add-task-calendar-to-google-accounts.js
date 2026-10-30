'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// Which Google calendar receives timed tasks (fork, see
// docs/33-google-sync.md). Empty: the "Cadence" calendar made by the sync.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'google_accounts', [
            {
                name: 'task_calendar_id',
                definition: { type: Sequelize.STRING, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn(
            'google_accounts',
            'task_calendar_id'
        );
    },
};

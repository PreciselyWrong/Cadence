'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// Per-calendar Google sync mode (fork, see docs/33-google-sync.md):
// 'hidden' (not pulled), 'read' (shown, read-only) or 'two_way' (editable).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'google_calendars', [
            {
                name: 'sync_mode',
                definition: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    defaultValue: 'read',
                },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('google_calendars', 'sync_mode');
    },
};

'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

module.exports = {
    // Local dates (YYYY-MM-DD) of a series' occurrences that were moved away
    // or removed; every advance of the series skips them.
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'recurrence_exdates',
                definition: { type: Sequelize.TEXT, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('tasks', 'recurrence_exdates');
    },
};

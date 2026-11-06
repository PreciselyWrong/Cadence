'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// The user's own order of the Today list (docs/20-daily-plan.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'today_order',
                definition: { type: Sequelize.INTEGER, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('tasks', 'today_order');
    },
};

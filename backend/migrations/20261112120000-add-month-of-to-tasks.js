'use strict';

const { safeAddColumns, safeEnsureIndex } = require('../utils/migration-utils');

// Horizon month: the calendar month (first day, YYYY-MM-01) a task is
// committed to, shown as "This month" / "Next month" on the Plan page. Like
// week_of, it is never a due date.
const INDEX_NAME = 'tasks_user_id_month_of_idx';

module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'month_of',
                definition: { type: Sequelize.DATEONLY, allowNull: true },
            },
        ]);
        // safeEnsureIndex, not safeAddIndex: the latter skips when any index
        // already contains user_id, which would leave this one uncreated.
        await safeEnsureIndex(
            queryInterface,
            'tasks',
            ['user_id', 'month_of'],
            {
                name: INDEX_NAME,
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('tasks', INDEX_NAME);
        await queryInterface.removeColumn('tasks', 'month_of');
    },
};

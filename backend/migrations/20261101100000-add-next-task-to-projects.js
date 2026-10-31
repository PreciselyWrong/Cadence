'use strict';

const {
    safeAddColumns,
    safeAddIndex,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// The task the user picked as the project's next action, by uid. It is not
// a foreign key: it follows the task across sync and is cleared by the
// application when the task is done, deleted or leaves the project.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'projects', [
            {
                name: 'next_task_uid',
                definition: { type: Sequelize.STRING, allowNull: true },
            },
        ]);
        await safeAddIndex(queryInterface, 'projects', ['next_task_uid'], {
            name: 'projects_next_task_uid',
        });
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'projects', 'next_task_uid');
    },
};

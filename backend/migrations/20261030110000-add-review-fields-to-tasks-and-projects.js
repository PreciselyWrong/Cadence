'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// Decision funnel: "In view" and "This week" on tasks, an optional review
// date for parked ideas, and when a task or project was last decided on in
// the review. None of them is a due date.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'in_view_at',
                definition: { type: Sequelize.DATE, allowNull: true },
            },
            {
                name: 'week_of',
                definition: { type: Sequelize.DATEONLY, allowNull: true },
            },
            {
                name: 'review_on',
                definition: { type: Sequelize.DATEONLY, allowNull: true },
            },
            {
                name: 'reviewed_at',
                definition: { type: Sequelize.DATE, allowNull: true },
            },
        ]);
        await safeAddColumns(queryInterface, 'projects', [
            {
                name: 'reviewed_at',
                definition: { type: Sequelize.DATE, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        for (const column of [
            'in_view_at',
            'week_of',
            'review_on',
            'reviewed_at',
        ]) {
            await queryInterface.removeColumn('tasks', column);
        }
        await queryInterface.removeColumn('projects', 'reviewed_at');
    },
};

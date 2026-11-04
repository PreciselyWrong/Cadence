'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

const BRIEF_COLUMNS = [
    'brief',
    'brief_version',
    'brief_status',
    'brief_generated_at',
];

// The daily brief lives on the day's plan row (docs/39-daily-brief.md, Data).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'daily_plans', [
            {
                name: 'brief',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
            {
                name: 'brief_version',
                definition: { type: Sequelize.INTEGER, allowNull: true },
            },
            {
                name: 'brief_status',
                definition: { type: Sequelize.STRING(16), allowNull: true },
            },
            {
                name: 'brief_generated_at',
                definition: { type: Sequelize.DATE, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        for (const column of BRIEF_COLUMNS) {
            await safeRemoveColumn(queryInterface, 'daily_plans', column);
        }
    },
};

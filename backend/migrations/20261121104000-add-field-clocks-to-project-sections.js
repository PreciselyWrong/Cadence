'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// Adds field_clocks to project_sections so board columns participate in
// field-level offline sync alongside tasks and projects.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'project_sections', [
            {
                name: 'field_clocks',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(
            queryInterface,
            'project_sections',
            'field_clocks'
        );
    },
};

'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// Adds field_clocks to comments so comments participate in field-level
// offline sync alongside tasks.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'comments', [
            {
                name: 'field_clocks',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'comments', 'field_clocks');
    },
};

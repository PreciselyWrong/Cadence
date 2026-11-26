'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// Tasks mirrored from a TODO.md file keep the place of their bullet in the
// file, so a board can list each section in the file's order.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'source_position',
                definition: { type: Sequelize.INTEGER, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'tasks', 'source_position');
    },
};

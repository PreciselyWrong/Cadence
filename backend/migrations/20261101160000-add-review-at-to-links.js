'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// links.review_at: the local day to look at a parked link again (docs/37-links.md).
// Never a due date: nothing becomes overdue from it.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'links', [
            {
                name: 'review_at',
                definition: { type: Sequelize.DATEONLY, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'links', 'review_at');
    },
};

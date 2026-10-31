'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// Optional icon id from the shared entity icon set (see
// frontend/constants/entityIcons.ts). The server stores the id only.
module.exports = {
    async up(queryInterface, Sequelize) {
        const definition = { type: Sequelize.STRING(40), allowNull: true };
        await safeAddColumns(queryInterface, 'projects', [
            { name: 'icon', definition },
        ]);
        await safeAddColumns(queryInterface, 'tags', [
            { name: 'icon', definition },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'projects', 'icon');
        await safeRemoveColumn(queryInterface, 'tags', 'icon');
    },
};

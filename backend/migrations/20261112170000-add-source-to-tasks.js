'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// Where a task came from (gmail, telegram, mcp, ...) and, when it has one, the
// page it points to. The values are checked in code (tasks/core/source.js),
// not by the database, so a new origin needs no migration.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'source',
                definition: { type: Sequelize.STRING(32), allowNull: true },
            },
            {
                name: 'source_url',
                definition: { type: Sequelize.TEXT, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('tasks', 'source_url');
        await queryInterface.removeColumn('tasks', 'source');
    },
};

'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// Stores the parsed `## État actuel` handoff block extracted from a linked
// TODO.md file (branch, tests, blockers, next_action, raw, updated_at).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'projects', [
            {
                name: 'handoff_state',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'projects', 'handoff_state');
    },
};

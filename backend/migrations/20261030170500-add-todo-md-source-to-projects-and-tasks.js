'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// Projects mirrored from a TODO.md file: the project says where it comes
// from, and each of its tasks keeps the section and the identity key it had
// in the file, so a re-read updates it in place.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'projects', [
            {
                name: 'source_type',
                definition: { type: Sequelize.STRING(32), allowNull: true },
            },
            {
                name: 'source_path',
                definition: { type: Sequelize.STRING(512), allowNull: true },
            },
        ]);
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'source_section',
                definition: { type: Sequelize.STRING(150), allowNull: true },
            },
            {
                name: 'source_key',
                definition: { type: Sequelize.STRING(64), allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('projects', 'source_type');
        await queryInterface.removeColumn('projects', 'source_path');
        await queryInterface.removeColumn('tasks', 'source_section');
        await queryInterface.removeColumn('tasks', 'source_key');
    },
};

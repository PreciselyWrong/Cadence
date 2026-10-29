'use strict';

const { safeAddColumns, safeAddIndex } = require('../utils/migration-utils');

// A sub-project points at its parent project. Nullable and additive: every
// existing project stays top-level. Deleting a parent turns its children into
// top-level projects (ON DELETE SET NULL). Depth and cycles are enforced in
// the service, not the schema.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'projects', [
            {
                name: 'parent_project_id',
                definition: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'projects',
                        key: 'id',
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL',
                },
            },
        ]);

        await safeAddIndex(queryInterface, 'projects', ['parent_project_id'], {
            name: 'projects_parent_project_id_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex(
            'projects',
            'projects_parent_project_id_idx'
        );
        await queryInterface.removeColumn('projects', 'parent_project_id');
    },
};

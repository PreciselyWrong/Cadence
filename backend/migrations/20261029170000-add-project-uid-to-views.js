'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// A saved view can be narrowed to one project by its uid. Nullable and
// additive: every existing view keeps searching all projects. The uid is not
// a foreign key; the search checks read access when the view runs.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'views', [
            {
                name: 'project_uid',
                definition: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('views', 'project_uid');
    },
};

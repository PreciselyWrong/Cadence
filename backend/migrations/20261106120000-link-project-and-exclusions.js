'use strict';

const {
    safeAddColumns,
    safeCreateTable,
    safeEnsureIndex,
} = require('../utils/migration-utils');

// A link can belong to a project; deleted links stay out of capture
// (docs/37-links.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'links', [
            {
                name: 'project_id',
                definition: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'projects', key: 'id' },
                    onDelete: 'SET NULL',
                },
            },
        ]);
        await safeCreateTable(queryInterface, 'link_exclusions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            url: { type: Sequelize.STRING(2048), allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await safeEnsureIndex(
            queryInterface,
            'link_exclusions',
            ['user_id', 'url'],
            { unique: true, name: 'link_exclusions_user_url_unique' }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('link_exclusions');
        await queryInterface.removeColumn('links', 'project_id');
    },
};

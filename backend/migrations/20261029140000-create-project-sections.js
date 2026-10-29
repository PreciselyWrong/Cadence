'use strict';

const {
    safeCreateTable,
    safeAddColumns,
    safeAddIndex,
    safeRemoveColumn,
} = require('../utils/migration-utils');

module.exports = {
    // Free board columns per project; a task sits in at most one of them.
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'project_sections', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            project_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'projects', key: 'id' },
                onDelete: 'CASCADE',
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            position: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });
        await safeAddIndex(
            queryInterface,
            'project_sections',
            ['project_id', 'position'],
            { name: 'project_sections_project_position' }
        );
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'section_id',
                definition: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'project_sections', key: 'id' },
                    onDelete: 'SET NULL',
                },
            },
        ]);
        await safeAddIndex(queryInterface, 'tasks', ['section_id'], {
            name: 'tasks_section_id',
        });
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'tasks', 'section_id');
        await queryInterface.dropTable('project_sections');
    },
};

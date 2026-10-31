'use strict';

const {
    safeAddColumns,
    safeAddIndex,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// A goal with a parent is a key result of that objective (one level only,
// enforced by the application). `bucket` puts a goal on the bucket list
// (have / be / do) instead of the dated goals. `field_clocks` lets goals
// take part in offline sync.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'goals', [
            {
                name: 'parent_goal_id',
                definition: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'goals', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE',
                },
            },
            {
                name: 'bucket',
                definition: {
                    type: Sequelize.ENUM('have', 'be', 'do'),
                    allowNull: true,
                },
            },
            {
                name: 'field_clocks',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
        ]);
        await safeAddIndex(queryInterface, 'goals', ['parent_goal_id'], {
            name: 'goals_parent_goal_id_idx',
        });
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'goals', 'field_clocks');
        await safeRemoveColumn(queryInterface, 'goals', 'bucket');
        await safeRemoveColumn(queryInterface, 'goals', 'parent_goal_id');
    },
};

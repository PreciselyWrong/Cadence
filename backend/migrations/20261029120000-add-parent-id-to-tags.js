'use strict';

const {
    safeAddColumns,
    safeAddIndex,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// Nested tags: a tag may sit under one parent tag (one level deep). Deleting
// the parent keeps its children; they become top-level tags.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tags', [
            {
                name: 'parent_id',
                definition: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'tags',
                        key: 'id',
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL',
                },
            },
        ]);

        await safeAddIndex(queryInterface, 'tags', ['parent_id']);
    },

    async down(queryInterface) {
        try {
            await queryInterface.removeIndex('tags', ['parent_id']);
        } catch (error) {
            console.log('Could not remove index parent_id:', error.message);
        }
        await safeRemoveColumn(queryInterface, 'tags', 'parent_id');
    },
};

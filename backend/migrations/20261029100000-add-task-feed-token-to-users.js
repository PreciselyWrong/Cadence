'use strict';

const { safeAddColumns, safeAddIndex } = require('../utils/migration-utils');

// Secret address for subscribing to your own tasks from another calendar
// app. Only a SHA-256 of the token is kept.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'users', [
            {
                name: 'task_feed_token_hash',
                definition: {
                    type: Sequelize.STRING(64),
                    allowNull: true,
                    defaultValue: null,
                },
            },
        ]);
        await safeAddIndex(queryInterface, 'users', ['task_feed_token_hash'], {
            unique: true,
            name: 'users_task_feed_token_hash',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('users', 'users_task_feed_token_hash');
        await queryInterface.removeColumn('users', 'task_feed_token_hash');
    },
};

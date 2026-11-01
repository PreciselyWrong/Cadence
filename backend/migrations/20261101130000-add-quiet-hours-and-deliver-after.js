'use strict';

const {
    safeAddColumns,
    safeAddIndex,
    safeRemoveColumn,
} = require('../utils/migration-utils');

// users.quiet_hours is {enabled, start, end} in the user's timezone.
// notifications.deliver_after holds push, Telegram, Apprise and desktop
// delivery until the quiet window ends; the in-app row exists immediately.
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'users', [
            {
                name: 'quiet_hours',
                definition: { type: Sequelize.JSON, allowNull: true },
            },
        ]);
        await safeAddColumns(queryInterface, 'notifications', [
            {
                name: 'deliver_after',
                definition: { type: Sequelize.DATE, allowNull: true },
            },
        ]);
        await safeAddIndex(queryInterface, 'notifications', ['deliver_after'], {
            name: 'notifications_deliver_after',
        });
    },

    async down(queryInterface) {
        await safeRemoveColumn(
            queryInterface,
            'notifications',
            'deliver_after'
        );
        await safeRemoveColumn(queryInterface, 'users', 'quiet_hours');
    },
};

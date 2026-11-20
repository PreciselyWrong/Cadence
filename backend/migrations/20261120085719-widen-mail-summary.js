'use strict';

const { widenStringColumn } = require('../utils/db-dialect');

module.exports = {
    async up(queryInterface, Sequelize) {
        await widenStringColumn(queryInterface, 'mail_items', 'summary', {
            type: Sequelize.STRING(500),
            allowNull: false,
        });
    },

    async down() {
        // Keep the wider column so rolling back cannot discard saved summaries.
    },
};

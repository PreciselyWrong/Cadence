'use strict';

const { safeCreateTable } = require('../utils/migration-utils');

// Admin choices about the plugins found in TUDUDI_PLUGINS_DIR
// (docs/46-plugins.md).
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeCreateTable(queryInterface, 'plugins', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            slug: {
                type: Sequelize.STRING(32),
                allowNull: false,
                unique: true,
            },
            enabled: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            settings: { type: Sequelize.JSON, allowNull: false },
            storage: { type: Sequelize.JSON, allowNull: false },
            grant: { type: Sequelize.JSON, allowNull: true },
            version_seen: { type: Sequelize.STRING(32), allowNull: true },
            previous_version: { type: Sequelize.STRING(32), allowNull: true },
            last_error: { type: Sequelize.TEXT, allowNull: true },
            update_check: { type: Sequelize.JSON, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('plugins');
    },
};

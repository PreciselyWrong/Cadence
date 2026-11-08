'use strict';

const { safeAddColumns } = require('../utils/migration-utils');

// « Quand ? » (docs/41-auto-classify.md): tasks the classifier already filed
// with no moment get the flag, so they come back to « Tâches à classer ».
module.exports = {
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'tasks', [
            {
                name: 'needs_when',
                definition: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
            },
        ]);
        const tables = await queryInterface.showAllTables();
        const names = tables.map((t) =>
            typeof t === 'string' ? t : t.tableName
        );
        if (!names.includes('auto_classify_changes')) return;
        await queryInterface.sequelize.query(
            `UPDATE tasks SET needs_when = :yes
             WHERE uid IN (
                 SELECT item_uid FROM auto_classify_changes
                 WHERE entity = 'task' AND dry_run = :no AND undone_at IS NULL
             )
             AND (project_id IS NOT NULL OR area_id IS NOT NULL)
             AND due_date IS NULL AND week_of IS NULL AND in_view_at IS NULL
             AND defer_until IS NULL AND parent_task_id IS NULL
             AND status NOT IN (2, 3, 5)`,
            { replacements: { yes: true, no: false } }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('tasks', 'needs_when');
    },
};

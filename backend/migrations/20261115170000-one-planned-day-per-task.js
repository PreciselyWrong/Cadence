'use strict';

// A task has one planned day (docs/20-daily-plan.md, "One planned day"). Plans
// written before that rule can hold a task on several days from today on; it
// keeps the line written last, the others go. Past days stay as history.
// Idempotent: a second run finds no duplicate. Nothing to restore on down.

// Rows sorted newest first per task; returns the ids of the older lines.
function duplicateLineIds(rows) {
    const seen = new Set();
    const drop = [];
    for (const row of rows) {
        if (seen.has(row.task_id)) drop.push(row.id);
        else seen.add(row.task_id);
    }
    return drop;
}

module.exports = {
    duplicateLineIds,

    async up(queryInterface) {
        const today = new Date().toISOString().slice(0, 10);
        const [rows] = await queryInterface.sequelize.query(
            `SELECT i.id, i.task_id
               FROM daily_plan_items i
               JOIN daily_plans p ON p.id = i.daily_plan_id
              WHERE p.plan_date >= :today
              ORDER BY i.task_id, i.created_at DESC, i.id DESC`,
            { replacements: { today } }
        );
        const ids = duplicateLineIds(rows);
        if (ids.length === 0) return;
        await queryInterface.bulkDelete('daily_plan_items', { id: ids });
    },

    async down() {},
};

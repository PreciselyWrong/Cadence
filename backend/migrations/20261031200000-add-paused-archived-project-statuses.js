'use strict';

// Two project statuses for what the user sets aside on purpose: `paused`
// (parked, to resume later) and `archived` (kept, out of attention).
// Abandoned reuses the existing `cancelled` value, only its label changes.
// SQLite stores the ENUM as TEXT, so only PostgreSQL has a type to extend.
const NEW_STATUSES = ['paused', 'archived'];

async function enumTypeName(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_name = 'projects' AND column_name = 'status'
           AND table_schema = current_schema()`
    );
    return rows[0]?.udt_name || null;
}

module.exports = {
    async up(queryInterface) {
        if (queryInterface.sequelize.getDialect() !== 'postgres') return;

        const typeName = await enumTypeName(queryInterface);
        if (!typeName) return;
        for (const value of NEW_STATUSES) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${value}'`
            );
        }
    },

    // PostgreSQL cannot drop an enum value: the type keeps it, rows go back
    // to the closest older status.
    async down(queryInterface) {
        await queryInterface.sequelize.query(
            `UPDATE projects SET status = 'waiting' WHERE status = 'paused'`
        );
        await queryInterface.sequelize.query(
            `UPDATE projects SET status = 'done' WHERE status = 'archived'`
        );
    },
};

'use strict';

// Goal horizons gain `month` and `quarter` next to `season` and `year`.
// SQLite stores the ENUM as TEXT, so only PostgreSQL has a type to extend.
const NEW_HORIZONS = ['month', 'quarter'];

async function enumTypeName(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_name = 'goals' AND column_name = 'horizon'
           AND table_schema = current_schema()`
    );
    return rows[0]?.udt_name || null;
}

module.exports = {
    async up(queryInterface) {
        if (queryInterface.sequelize.getDialect() !== 'postgres') return;

        const typeName = await enumTypeName(queryInterface);
        if (!typeName) return;
        for (const value of NEW_HORIZONS) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${value}'`
            );
        }
    },

    // PostgreSQL cannot drop an enum value: the type keeps it, rows go back
    // to the closest older horizon.
    async down(queryInterface) {
        await queryInterface.sequelize.query(
            `UPDATE goals SET horizon = 'season' WHERE horizon IN ('month', 'quarter')`
        );
    },
};

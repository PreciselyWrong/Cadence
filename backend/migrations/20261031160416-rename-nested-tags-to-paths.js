'use strict';

// Tag names became paths (`parent/child`). Before, a child tag kept its bare
// name and only parent_id linked it, so its name becomes the parent's name
// followed by "/". Rows already renamed have a "/" and are skipped, so the
// migration can run again. Each statement is valid on SQLite and PostgreSQL.
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(
            `UPDATE tags
                SET name = (SELECT p.name FROM tags AS p WHERE p.id = tags.parent_id) || '/' || tags.name
              WHERE parent_id IS NOT NULL
                AND REPLACE(name, '/', '') = name
                AND EXISTS (SELECT 1 FROM tags AS p WHERE p.id = tags.parent_id)`
        );
    },

    // Keeps only the last segment of the name, for rows with a parent. Rows
    // whose leaf name is already taken by a top-level tag make this fail.
    async down(queryInterface) {
        const [rows] = await queryInterface.sequelize.query(
            'SELECT id, name FROM tags WHERE parent_id IS NOT NULL'
        );
        for (const row of rows) {
            if (!row.name.includes('/')) continue;
            await queryInterface.sequelize.query(
                'UPDATE tags SET name = :name WHERE id = :id',
                {
                    replacements: {
                        id: row.id,
                        name: row.name.slice(row.name.lastIndexOf('/') + 1),
                    },
                }
            );
        }
    },
};

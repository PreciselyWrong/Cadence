'use strict';

// The links library goes (docs/fork/PLAN-links.md, Données). Each link finds
// its home once, on SQLite and PostgreSQL alike:
// - an archived link is deleted;
// - a link in a project stays: it is a page of that project;
// - a link « À voir » whose source task still exists is deleted (the task
//   holds the address);
// - any other link becomes a task « Verbe : titre » waiting in « Tâches à
//   classer » for « Quand ? », with the user's own note (never the
//   « Résumé auto » written by the classifier) and the link's tags.
// Idempotent: a second run finds only pages. Nothing to restore on down.

const { uid } = require('../utils/uid');
const { taskNameFor } = require('../modules/links/core/taskName');
const { translate } = require('../modules/spreadsheets/core/locales');

const AUTO_SUMMARY = /^\s*Résumé auto\s*:/i;

// The user's note without the classifier's summary paragraphs.
function userNote(note) {
    if (typeof note !== 'string') return '';
    return note
        .split(/\n\s*\n/)
        .filter((paragraph) => !AUTO_SUMMARY.test(paragraph))
        .join('\n\n')
        .trim();
}

async function deleteLinks(queryInterface, ids, transaction) {
    if (ids.length === 0) return;
    await queryInterface.bulkDelete(
        'links_tags',
        { link_id: ids },
        { transaction }
    );
    await queryInterface.bulkDelete('links', { id: ids }, { transaction });
}

module.exports = {
    async up(queryInterface) {
        const { sequelize } = queryInterface;
        const tables = await queryInterface.showAllTables();
        if (!tables.includes('links')) return;
        // A database made after the library went has none of its columns.
        const columns = await queryInterface.describeTable('links');
        const has = (name) => name in columns;
        const select = (sql, replacements = {}, transaction) =>
            sequelize.query(sql, {
                replacements,
                transaction,
                type: sequelize.QueryTypes.SELECT,
            });

        // Agents' slot proposals for links (`propose_link_slot`) are gone.
        if (tables.includes('task_triage')) {
            await sequelize.query(
                "DELETE FROM task_triage WHERE task_uid LIKE 'slot:%'"
            );
        }

        await sequelize.transaction(async (transaction) => {
            const archived = has('status')
                ? await select(
                      "SELECT id FROM links WHERE status = 'dropped'",
                      {},
                      transaction
                  )
                : [];
            await deleteLinks(
                queryInterface,
                archived.map((row) => row.id),
                transaction
            );

            const loose = await select(
                `SELECT l.id, l.user_id, l.url, l.title, l.note, l.kind,
                        ${has('source_type') ? 'l.source_type, l.source_uid' : 'NULL AS source_type, NULL AS source_uid'},
                        u.language
                   FROM links l JOIN users u ON u.id = l.user_id
                  WHERE l.project_id IS NULL
                  ORDER BY l.id`,
                {},
                transaction
            );
            const now = new Date();
            for (const link of loose) {
                let covered = false;
                if (link.source_type === 'task' && link.source_uid) {
                    const [found] = await select(
                        'SELECT id FROM tasks WHERE uid = :uid AND user_id = :user',
                        { uid: link.source_uid, user: link.user_id },
                        transaction
                    );
                    covered = Boolean(found);
                }
                if (!covered) {
                    const taskUid = uid();
                    const name = taskNameFor(
                        { url: link.url, title: link.title, kind: link.kind },
                        (key) => translate(link.language || 'en', key)
                    );
                    const words = userNote(link.note);
                    await queryInterface.bulkInsert(
                        'tasks',
                        [
                            {
                                uid: taskUid,
                                name: name.slice(0, 500),
                                note: [link.url, words]
                                    .filter(Boolean)
                                    .join('\n\n'),
                                status: 0,
                                recurrence_type: 'none',
                                completion_based: false,
                                start_has_time: false,
                                due_has_time: false,
                                needs_when: true,
                                habit_mode: false,
                                source: 'link',
                                source_url: link.url,
                                user_id: link.user_id,
                                created_at: now,
                                updated_at: now,
                            },
                        ],
                        { transaction }
                    );
                    const [task] = await select(
                        'SELECT id FROM tasks WHERE uid = :uid',
                        { uid: taskUid },
                        transaction
                    );
                    const tags = await select(
                        'SELECT tag_id FROM links_tags WHERE link_id = :id',
                        { id: link.id },
                        transaction
                    );
                    if (tags.length > 0) {
                        await queryInterface.bulkInsert(
                            'tasks_tags',
                            tags.map((tag) => ({
                                task_id: task.id,
                                tag_id: tag.tag_id,
                                created_at: now,
                                updated_at: now,
                            })),
                            { transaction }
                        );
                    }
                }
                await deleteLinks(queryInterface, [link.id], transaction);
            }
        });
    },

    async down() {},
};

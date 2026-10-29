'use strict';

const { sequelize, Project, ProjectSection, Task } = require('../../models');

const ATTRIBUTES = [
    'id',
    'uid',
    'name',
    'position',
    'created_at',
    'updated_at',
];

function serialize(section) {
    const json = section.toJSON ? section.toJSON() : section;
    return {
        uid: json.uid,
        name: json.name,
        position: json.position,
        created_at: json.created_at,
        updated_at: json.updated_at,
    };
}

const projectSectionsRepository = {
    serialize,

    async findProjectByUid(projectUid) {
        return Project.findOne({
            where: { uid: projectUid },
            attributes: ['id', 'uid'],
        });
    },

    async listForProject(projectId) {
        return ProjectSection.findAll({
            where: { project_id: projectId },
            attributes: ATTRIBUTES,
            order: [
                ['position', 'ASC'],
                ['id', 'ASC'],
            ],
        });
    },

    async findInProject(projectId, sectionUid) {
        return ProjectSection.findOne({
            where: { project_id: projectId, uid: sectionUid },
        });
    },

    async findByUid(sectionUid) {
        return ProjectSection.findOne({ where: { uid: sectionUid } });
    },

    // Inserts at `position` (end when omitted) and shifts the columns after it.
    async create(projectId, name, position) {
        return sequelize.transaction(async (transaction) => {
            const existing = await ProjectSection.findAll({
                where: { project_id: projectId },
                order: [
                    ['position', 'ASC'],
                    ['id', 'ASC'],
                ],
                transaction,
            });
            const index =
                Number.isInteger(position) &&
                position >= 0 &&
                position <= existing.length
                    ? position
                    : existing.length;
            for (let i = 0; i < existing.length; i++) {
                const wanted = i < index ? i : i + 1;
                if (existing[i].position !== wanted) {
                    await existing[i].update(
                        { position: wanted },
                        { transaction }
                    );
                }
            }
            return ProjectSection.create(
                { project_id: projectId, name, position: index },
                { transaction }
            );
        });
    },

    async rename(section, name) {
        return section.update({ name });
    },

    // `orderedUids` must list every section of the project exactly once.
    async reorder(projectId, orderedUids) {
        return sequelize.transaction(async (transaction) => {
            const sections = await ProjectSection.findAll({
                where: { project_id: projectId },
                transaction,
            });
            const byUid = new Map(sections.map((s) => [s.uid, s]));
            const unique = new Set(orderedUids);
            if (
                unique.size !== orderedUids.length ||
                orderedUids.length !== sections.length ||
                !orderedUids.every((u) => byUid.has(u))
            ) {
                return false;
            }
            for (let i = 0; i < orderedUids.length; i++) {
                const section = byUid.get(orderedUids[i]);
                if (section.position !== i) {
                    await section.update({ position: i }, { transaction });
                }
            }
            return true;
        });
    },

    // Tasks of the section go back to "no section".
    // Puts the listed tasks, in this order, into the column (sectionId null =
    // Unsectioned). Every uid must be a task of the project, listed once.
    // Tasks already in the column but not listed keep their position.
    async orderTasks(projectId, sectionId, orderedUids) {
        if (new Set(orderedUids).size !== orderedUids.length) return false;
        return sequelize.transaction(async (transaction) => {
            const tasks = orderedUids.length
                ? await Task.findAll({
                      where: { project_id: projectId, uid: orderedUids },
                      attributes: [
                          'id',
                          'uid',
                          'section_id',
                          'section_position',
                      ],
                      transaction,
                  })
                : [];
            if (tasks.length !== orderedUids.length) return false;
            const byUid = new Map(tasks.map((t) => [t.uid, t]));
            for (let i = 0; i < orderedUids.length; i++) {
                const task = byUid.get(orderedUids[i]);
                if (
                    task.section_position !== i ||
                    (task.section_id || null) !== sectionId
                ) {
                    await Task.update(
                        { section_id: sectionId, section_position: i },
                        { where: { id: task.id }, transaction }
                    );
                }
            }
            return true;
        });
    },

    async destroy(section) {
        return sequelize.transaction(async (transaction) => {
            await Task.update(
                { section_id: null, section_position: null },
                { where: { section_id: section.id }, transaction }
            );
            await section.destroy({ transaction });
        });
    },
};

module.exports = projectSectionsRepository;

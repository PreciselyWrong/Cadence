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
    async destroy(section) {
        return sequelize.transaction(async (transaction) => {
            await Task.update(
                { section_id: null },
                { where: { section_id: section.id }, transaction }
            );
            await section.destroy({ transaction });
        });
    },
};

module.exports = projectSectionsRepository;

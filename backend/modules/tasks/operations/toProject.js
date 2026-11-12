'use strict';

// « Transformer en projet » (docs/37-links.md): a task that grew becomes a
// project. Its name and note become the project's name and description, its
// subtasks the project's tasks, the addresses of its note the project's
// pages, its tags and domain follow; the task goes. Only the owner, never a
// recurring task, a subtask or a task that follows a TODO.md file.

const {
    Link,
    Project,
    Tag,
    Task,
    TaskAttachment,
    sequelize,
} = require('../../../models');
const { destroyTaskRows } = require('./deletion');
const { urlsIn } = require('../../links/core/taskName');
const {
    classifyKind,
    isContextUrl,
    normalizeUrl,
} = require('../../links/core/urls');
const {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} = require('../../../shared/errors');

async function taskToProject(userId, uid) {
    const task = await Task.findOne({
        where: { uid },
        include: [
            { model: Tag, through: { attributes: [] } },
            { model: TaskAttachment, as: 'Attachments' },
        ],
    });
    if (!task) throw new NotFoundError('Task not found');
    if (task.user_id !== userId) {
        throw new ForbiddenError(
            'Only the owner can turn a task into a project'
        );
    }
    if (task.parent_task_id)
        throw new ValidationError('A subtask stays a task');
    if (task.recurrence_type && task.recurrence_type !== 'none') {
        throw new ValidationError('A recurring task stays a series');
    }
    if (task.recurring_parent_id) {
        throw new ValidationError('A recurring task stays a series');
    }
    if (task.source_key) {
        throw new ValidationError('This task follows a TODO.md file');
    }

    const addresses = [
        ...new Set(
            urlsIn(task.note || '')
                .map(normalizeUrl)
                .filter((url) => url && !isContextUrl(url))
        ),
    ];
    const created = await sequelize.transaction(async (transaction) => {
        const project = await Project.create(
            {
                user_id: userId,
                name: task.name,
                description: task.note || '',
                status: 'planned',
                area_id: task.area_id ?? null,
            },
            { transaction }
        );
        if (task.Tags?.length)
            await project.setTags(task.Tags, { transaction });
        const subtasks = await Task.findAll({
            where: { parent_task_id: task.id },
            transaction,
        });
        for (const subtask of subtasks) {
            await subtask.update(
                { parent_task_id: null, project_id: project.id },
                { transaction }
            );
        }
        const pages = [];
        for (const url of addresses) {
            pages.push(
                await Link.create(
                    {
                        user_id: userId,
                        url,
                        kind: classifyKind(url),
                        project_id: project.id,
                    },
                    { transaction }
                )
            );
        }
        return { project, pages };
    });
    await destroyTaskRows(task);
    for (const page of created.pages) {
        require('../../links/jobs').enqueueFetch(page.id);
    }
    return {
        project: { uid: created.project.uid, name: created.project.name },
    };
}

module.exports = { taskToProject };

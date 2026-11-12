'use strict';

// Every database read and write of automatic classification. Items are read
// into the plain shapes the pure rules in core/ expect.
const { Op } = require('sequelize');
const {
    sequelize,
    Task,
    Note,
    Project,
    Area,
    Tag,
    User,
    Setting,
    SyncChange,
    AutoClassifyItem,
    AutoClassifyChange,
    AutoClassifySuggestion,
} = require('../../models');
const { SOURCE_TYPE } = require('../todo-md/service');
const { CLOSED_PROJECT_STATUSES } = require('./core/eligibility');

const ENTITIES = ['task', 'note'];
const OPEN_TASK_STATUSES = [0, 1, 4, 6];
const EXAMPLES_PER_PROJECT = 4;
const tagInclude = {
    model: Tag,
    attributes: ['name'],
    through: { attributes: [] },
};
const projectInclude = {
    model: Project,
    attributes: ['id', 'uid', 'name', 'status', 'source_type'],
    required: false,
};

const tagNamesOf = (row) => (row.Tags || []).map((tag) => tag.name);

function projectShape(project) {
    if (!project) return null;
    return {
        uid: project.uid,
        name: project.name,
        status: project.status,
        file_backed: project.source_type === SOURCE_TYPE,
    };
}

function taskShape(task) {
    return {
        entity: 'task',
        id: task.id,
        uid: task.uid,
        user_id: task.user_id,
        name: task.name,
        note: task.note,
        status: task.status,
        recurring:
            (task.recurrence_type && task.recurrence_type !== 'none') ||
            Boolean(task.recurring_parent_id),
        habit_mode: Boolean(task.habit_mode),
        parent_task_id: task.parent_task_id,
        source_key: task.source_key,
        project_id: task.project_id,
        area_id: task.area_id,
        estimated_minutes: task.estimated_minutes,
        priority: task.priority,
        due_date: task.due_date,
        tags: tagNamesOf(task),
        project: projectShape(task.Project),
        created_at: task.created_at,
    };
}

function noteShape(note) {
    return {
        entity: 'note',
        id: note.id,
        uid: note.uid,
        user_id: note.user_id,
        title: note.title,
        content: note.content,
        project_id: note.project_id,
        tags: tagNamesOf(note),
        project: projectShape(note.Project),
        created_at: note.created_at,
    };
}

const LOADERS = {
    task: [Task, taskShape],
    note: [Note, noteShape],
};

// The item as the rules see it, or null when it no longer exists.
async function loadItem(userId, entity, uid) {
    if (!LOADERS[entity]) return null;
    const [Model, shape] = LOADERS[entity];
    const row = await Model.findOne({
        where: { uid, user_id: userId },
        include: [tagInclude, projectInclude],
    });
    return row ? shape(row) : null;
}

function itemTitle(item) {
    const title =
        item.entity === 'task'
            ? item.name
            : item.title || (item.content || '').slice(0, 80);
    return title ? String(title).slice(0, 255) : null;
}

async function createdAtOf(userId, entity, uid) {
    const [Model] = LOADERS[entity];
    const row = await Model.findOne({
        where: { uid, user_id: userId },
        attributes: ['created_at'],
        raw: true,
    });
    return row ? new Date(row.created_at) : null;
}

// What the model may name: the user's domains, open projects with a few
// open tasks each, and tags with how often they are used.
async function readCatalog(userId) {
    const [areas, projects, tags] = await Promise.all([
        Area.findAll({
            where: { user_id: userId },
            attributes: ['id', 'uid', 'name', 'description'],
            order: [['name', 'ASC']],
            raw: true,
        }),
        Project.findAll({
            where: {
                user_id: userId,
                status: { [Op.notIn]: [...CLOSED_PROJECT_STATUSES] },
                is_template: { [Op.not]: true },
                [Op.or]: [
                    { source_type: null },
                    { source_type: { [Op.ne]: SOURCE_TYPE } },
                ],
            },
            attributes: ['id', 'uid', 'name', 'description', 'area_id'],
            order: [['name', 'ASC']],
            raw: true,
        }),
        Tag.findAll({
            where: { user_id: userId },
            attributes: ['id', 'name'],
            order: [['name', 'ASC']],
            raw: true,
        }),
    ]);
    const areaUid = new Map(areas.map((area) => [area.id, area.uid]));
    const examples = await openTaskExamples(projects.map((p) => p.id));
    const uses = await tagUses(tags.map((tag) => tag.id));
    return {
        areas: areas.map(({ uid, name, description }) => ({
            uid,
            name,
            description,
        })),
        projects: projects.map((project) => ({
            id: project.id,
            uid: project.uid,
            name: project.name,
            description: project.description,
            area_uid: areaUid.get(project.area_id) ?? null,
            examples: examples.get(project.id) ?? [],
        })),
        tags: tags.map((tag) => ({
            name: tag.name,
            uses: uses.get(tag.id) ?? 0,
        })),
    };
}

async function openTaskExamples(projectIds) {
    const examples = new Map();
    if (projectIds.length === 0) return examples;
    const tasks = await Task.findAll({
        where: {
            project_id: { [Op.in]: projectIds },
            status: { [Op.in]: OPEN_TASK_STATUSES },
            parent_task_id: null,
        },
        attributes: ['name', 'project_id'],
        order: [['id', 'DESC']],
        limit: projectIds.length * 25,
        raw: true,
    });
    for (const task of tasks) {
        const list = examples.get(task.project_id) ?? [];
        if (list.length < EXAMPLES_PER_PROJECT) list.push(task.name);
        examples.set(task.project_id, list);
    }
    return examples;
}

async function tagUses(tagIds) {
    const uses = new Map();
    if (tagIds.length === 0) return uses;
    for (const table of ['tasks_tags', 'notes_tags']) {
        const rows = await sequelize.query(
            `SELECT tag_id, COUNT(*) AS n FROM ${table} WHERE tag_id IN (:ids) GROUP BY tag_id`,
            { replacements: { ids: tagIds }, type: sequelize.QueryTypes.SELECT }
        );
        for (const row of rows) {
            uses.set(row.tag_id, (uses.get(row.tag_id) ?? 0) + Number(row.n));
        }
    }
    return uses;
}

const settingValue = async (key) =>
    (await Setting.findOne({ where: { key }, raw: true }))?.value ?? null;

const setSetting = (key, value) =>
    Setting.upsert({ key, value: String(value) });

async function maxJournalId() {
    return (await SyncChange.max('id')) ?? 0;
}

async function journalAfter(cursor, limit) {
    return SyncChange.findAll({
        where: {
            id: { [Op.gt]: cursor },
            entity: { [Op.in]: ENTITIES },
            op: 'upsert',
        },
        attributes: ['id', 'user_id', 'entity', 'uid'],
        order: [['id', 'ASC']],
        limit,
        raw: true,
    });
}

async function findUser(userId) {
    return User.findByPk(userId);
}

// The user's tasks and notes created since `from`, newest first.
async function recentItems(userId, from, limit) {
    const lists = await Promise.all(
        Object.entries(LOADERS).map(async ([entity, [Model]]) =>
            (
                await Model.findAll({
                    where: { user_id: userId, created_at: { [Op.gte]: from } },
                    attributes: ['uid', 'created_at'],
                    order: [['created_at', 'DESC']],
                    limit,
                    raw: true,
                })
            ).map((row) => ({
                entity,
                uid: row.uid,
                created_at: row.created_at,
            }))
        )
    );
    return lists
        .flat()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit);
}

async function findUiSettings(userId) {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'ui_settings'],
    });
    const value = user?.ui_settings;
    if (typeof value !== 'string') return value || {};
    try {
        return JSON.parse(value) || {};
    } catch {
        return {};
    }
}

async function saveClassifySettings(userId, classify) {
    const settings = await findUiSettings(userId);
    await User.update(
        { ui_settings: { ...settings, classify } },
        { where: { id: userId } }
    );
}

async function areaIdOf(userId, uid) {
    const area = await Area.findOne({
        where: { uid, user_id: userId },
        attributes: ['id'],
        raw: true,
    });
    return area?.id ?? null;
}

// A task just filed for the user with no moment yet asks « Quand ? »; the
// Task hook clears it as soon as one is chosen. Subtasks, recurring and
// #someday tasks never ask.
async function askWhen(userId, uid) {
    const task = await Task.findOne({
        where: { uid, user_id: userId },
        include: [
            { model: Tag, attributes: ['name'], through: { attributes: [] } },
        ],
    });
    if (!task || task.parent_task_id || task.recurring_parent_id) return;
    if (task.recurrence_type && task.recurrence_type !== 'none') return;
    if ((task.Tags || []).some((tag) => tag.name === 'someday')) return;
    task.needs_when = true;
    await task.save();
}

async function settleWhen(userId, uid) {
    const task = await Task.findOne({ where: { uid, user_id: userId } });
    if (task?.needs_when) await task.update({ needs_when: false });
}

const NOT_CONFIGURED = 'AI_NOT_CONFIGURED';
const retryableWhere = (userId) => ({
    user_id: userId,
    [Op.or]: [
        { state: 'failed' },
        { state: 'skipped', last_error: NOT_CONFIGURED },
    ],
});

// The newest API error, unless a call succeeded after it, and how many items
// gave up or were skipped for want of a provider.
async function classifyHealth(userId) {
    const failing = await AutoClassifyItem.findOne({
        where: {
            user_id: userId,
            state: { [Op.in]: ['queued', 'failed'] },
            last_error: {
                [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: NOT_CONFIGURED }],
            },
        },
        order: [['updated_at', 'DESC']],
        attributes: ['last_error', 'updated_at'],
    });
    const lastOk = failing
        ? await AutoClassifyItem.max('updated_at', {
              where: {
                  user_id: userId,
                  state: { [Op.in]: ['done', 'changed'] },
              },
          })
        : null;
    const current =
        failing && (!lastOk || new Date(failing.updated_at) > new Date(lastOk));
    return {
        last_error: current
            ? { message: failing.last_error, at: failing.updated_at }
            : null,
        retryable: await AutoClassifyItem.count({
            where: retryableWhere(userId),
        }),
    };
}

async function requeueFailed(userId, now) {
    const [count] = await AutoClassifyItem.update(
        {
            state: 'queued',
            attempts: 0,
            next_attempt_at: now,
            last_error: null,
        },
        { where: retryableWhere(userId) }
    );
    return count;
}

module.exports = {
    ENTITIES,
    askWhen,
    settleWhen,
    classifyHealth,
    requeueFailed,
    loadItem,
    itemTitle,
    createdAtOf,
    readCatalog,
    settingValue,
    setSetting,
    maxJournalId,
    journalAfter,
    findUser,
    areaIdOf,
    recentItems,
    findUiSettings,
    saveClassifySettings,
    Item: AutoClassifyItem,
    Change: AutoClassifyChange,
    Suggestion: AutoClassifySuggestion,
};

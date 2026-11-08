'use strict';

// What the classifier puts to the user when it is unsure (a project, tags or
// a priority raise) or finds a duplicate link: one card per item, in the
// "À trier" queue on the web and Android, answered in a tap. Nothing changes
// before that tap (docs/41-auto-classify.md).
const { Op } = require('sequelize');
const { toolsFor } = require('../triage/actions');
const {
    NotFoundError,
    ValidationError,
    ConflictError,
} = require('../../shared/errors');
const repository = require('./repository');
const { forgetCatalog } = require('./model');

const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_MAX = 100;
const DUPLICATE_ACTIONS = ['drop_new', 'merge', 'keep_new', 'keep_both'];

function startOfDay(now) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    return day;
}

async function underDailyLimit(userId, settings, now) {
    if (!settings.daily_suggestion_limit) return true;
    const today = await repository.Suggestion.count({
        where: { user_id: userId, created_at: { [Op.gte]: startOfDay(now) } },
    });
    return today < settings.daily_suggestion_limit;
}

// The card as the clients show it, with names resolved now.
function classifyPayload(title, ask, catalog) {
    const project = (uid) => catalog.projects.find((p) => p.uid === uid);
    const areaName = (uid) =>
        catalog.areas.find((a) => a.uid === uid)?.name ?? null;
    const payload = { title, project: null, tags: null, priority: null };
    if (ask.project) {
        payload.project = {
            options: ask.project.options.map((option) => ({
                uid: option.uid,
                name: project(option.uid)?.name ?? option.uid,
                area_name: areaName(project(option.uid)?.area_uid),
                confidence: option.confidence,
            })),
            area: ask.project.area_uid
                ? {
                      uid: ask.project.area_uid,
                      name: areaName(ask.project.area_uid),
                  }
                : null,
            new_project: ask.project.new_project
                ? {
                      ...ask.project.new_project,
                      area_name: areaName(ask.project.new_project.area_uid),
                  }
                : null,
        };
    }
    if (ask.tags) payload.tags = ask.tags;
    if (ask.priority) payload.priority = ask.priority;
    return payload;
}

// One card per item, ever: a second one for the same item is never made.
async function create(user, item, kind, payload, runId, settings, now) {
    if (!(await underDailyLimit(user.id, settings, now))) return null;
    const [suggestion, created] = await repository.Suggestion.findOrCreate({
        where: { user_id: user.id, entity: item.entity, item_uid: item.uid },
        defaults: {
            kind,
            payload,
            run_id: runId,
            expires_at: new Date(
                now.getTime() + settings.suggestion_ttl_days * DAY_MS
            ),
        },
    });
    return created ? suggestion : null;
}

function createClassify(user, item, ask, catalog, runId, settings, now) {
    const payload = classifyPayload(repository.itemTitle(item), ask, catalog);
    return create(user, item, 'classify', payload, runId, settings, now);
}

function createDuplicate(user, link, found, runId, settings, now) {
    const payload = {
        title: repository.itemTitle(link),
        url: link.url,
        reason: found.reason,
        original: {
            uid: found.original.uid,
            title: found.original.title || null,
            url: found.original.url,
            created_at: found.original.created_at,
        },
    };
    return create(user, link, 'duplicate', payload, runId, settings, now);
}

async function expire(now = new Date()) {
    await repository.Suggestion.update(
        { state: 'expired', decided_at: now },
        { where: { state: 'pending', expires_at: { [Op.lte]: now } } }
    );
}

function serialize(suggestion) {
    return {
        uid: suggestion.uid,
        kind: suggestion.kind,
        entity: suggestion.entity,
        item_uid: suggestion.item_uid,
        payload: suggestion.payload,
        created_at: suggestion.created_at,
        expires_at: suggestion.expires_at,
    };
}

// Pending cards whose item still exists, newest first.
async function listPending(userId, now = new Date()) {
    await expire(now);
    const rows = await repository.Suggestion.findAll({
        where: { user_id: userId, state: 'pending' },
        order: [['created_at', 'DESC']],
    });
    const alive = [];
    for (const row of rows) {
        if (await repository.loadItem(userId, row.entity, row.item_uid)) {
            alive.push(serialize(row));
        } else {
            await row.update({ state: 'expired', decided_at: now });
        }
    }
    return alive;
}

async function findPending(userId, uid) {
    const suggestion = await repository.Suggestion.findOne({
        where: { uid, user_id: userId },
    });
    if (!suggestion) throw new NotFoundError('Suggestion not found');
    if (suggestion.state !== 'pending') {
        throw new ConflictError(`Suggestion already ${suggestion.state}`);
    }
    return suggestion;
}

const cleanName = (raw, field) => {
    const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > NAME_MAX) {
        throw new ValidationError(
            `${field} must hold 1 to ${NAME_MAX} characters`
        );
    }
    return name;
};

// "Tout accepter": the best project, every tag offered, the priority; never
// a new project or tag, which need the user's own words.
function acceptAll(payload) {
    return {
        project: payload.project?.options?.[0]
            ? { type: 'project', uid: payload.project.options[0].uid }
            : payload.project?.area
              ? { type: 'area', uid: payload.project.area.uid }
              : { type: 'none' },
        tags: payload.tags?.options ?? [],
        new_tag: null,
        priority: payload.priority?.value ?? null,
    };
}

async function createProject(run, userId, choice) {
    const name = cleanName(choice.name, 'name');
    const areaId = choice.area_uid
        ? await repository.areaIdOf(userId, choice.area_uid)
        : null;
    const result = await run('create_project', {
        name,
        ...(areaId ? { area_id: areaId } : {}),
    });
    forgetCatalog(userId);
    return JSON.parse(result.content[0].text).project.uid;
}

async function applyClassify(user, suggestion, choice) {
    const run = toolsFor(user);
    const item = await repository.loadItem(
        user.id,
        suggestion.entity,
        suggestion.item_uid
    );
    if (!item) throw new NotFoundError('Item not found');
    const isTask = item.entity === 'task';
    const params = isTask ? { id: item.uid } : { uid: item.uid };
    const project = choice.project ?? { type: 'none' };
    if (project.type === 'project' || project.type === 'new_project') {
        const uid =
            project.type === 'project'
                ? project.uid
                : await createProject(run, user.id, project);
        if (typeof uid !== 'string' || !uid) {
            throw new ValidationError('project uid is required');
        }
        params[isTask ? 'project_id' : 'project_uid'] = uid;
    } else if (project.type === 'area') {
        if (!isTask) throw new ValidationError('Only a task takes a domain');
        params.area_uid = project.uid;
    } else if (project.type !== 'none') {
        throw new ValidationError(`Unknown project choice: ${project.type}`);
    }
    const tags = Array.isArray(choice.tags) ? choice.tags : [];
    const newTag = choice.new_tag ? cleanName(choice.new_tag, 'new_tag') : null;
    const added = [...tags, ...(newTag ? [newTag] : [])].filter(
        (tag) => typeof tag === 'string' && tag.trim()
    );
    if (added.length > 0) {
        params.tags = [...new Set([...item.tags, ...added])];
    }
    if (choice.priority !== undefined && choice.priority !== null) {
        if (!isTask || ![1, 2].includes(choice.priority)) {
            throw new ValidationError('priority must be 1 or 2, on a task');
        }
        params.priority = choice.priority === 2 ? 'high' : 'medium';
    }
    if (Object.keys(params).length > 1) {
        const tool = {
            task: 'update_task',
            note: 'update_note',
            link: 'update_link',
        };
        await run(tool[item.entity], params);
    }
    if (isTask && (params.project_id || params.area_uid)) {
        await repository.askWhen(user.id, item.uid);
    }
    if (newTag) forgetCatalog(user.id);
}

async function applyDuplicate(user, suggestion, action) {
    if (!DUPLICATE_ACTIONS.includes(action)) {
        throw new ValidationError(`Unknown duplicate action: ${action}`);
    }
    const run = toolsFor(user);
    const fresh = await repository.loadItem(
        user.id,
        'link',
        suggestion.item_uid
    );
    const original = await repository.loadItem(
        user.id,
        'link',
        suggestion.payload.original.uid
    );
    if (!fresh || !original) throw new NotFoundError('Link not found');
    const drop = (link) =>
        run('update_link', { uid: link.uid, status: 'dropped' });
    if (action === 'drop_new') await drop(fresh);
    if (action === 'keep_new') await drop(original);
    if (action === 'merge') {
        const notes = [original.note, fresh.note]
            .map((note) => (note || '').trim())
            .filter(Boolean);
        await run('update_link', {
            uid: original.uid,
            tags: [...new Set([...original.tags, ...fresh.tags])],
            note: [...new Set(notes)].join('\n\n') || null,
        });
        await drop(fresh);
    }
}

// `choice`: 'all', 'none', or { project, tags, new_tag, priority } for a
// classification card; { action } for a duplicate.
async function apply(user, uid, choice, now = new Date()) {
    const suggestion = await findPending(user.id, uid);
    if (suggestion.kind === 'duplicate') {
        const action = typeof choice === 'string' ? choice : choice?.action;
        await applyDuplicate(user, suggestion, action);
        await suggestion.update({
            state: 'applied',
            choice: { action },
            decided_at: now,
        });
        return serialize(suggestion);
    }
    if (choice === 'none') return dismiss(user, uid, now);
    const resolved = choice === 'all' ? acceptAll(suggestion.payload) : choice;
    if (!resolved || typeof resolved !== 'object') {
        throw new ValidationError('choice is required');
    }
    await applyClassify(user, suggestion, resolved);
    await suggestion.update({
        state: 'applied',
        choice: resolved,
        decided_at: now,
    });
    return serialize(suggestion);
}

async function dismiss(user, uid, now = new Date()) {
    const suggestion = await findPending(user.id, uid);
    await suggestion.update({ state: 'dismissed', decided_at: now });
    return serialize(suggestion);
}

module.exports = {
    createClassify,
    createDuplicate,
    listPending,
    apply,
    dismiss,
    expire,
    acceptAll,
    DUPLICATE_ACTIONS,
};

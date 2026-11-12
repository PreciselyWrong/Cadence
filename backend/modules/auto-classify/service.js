'use strict';

// Settings, history, marks and undo of automatic classification
// (docs/41-auto-classify.md).
const { Op } = require('sequelize');
const {
    NotFoundError,
    ValidationError,
    ConflictError,
} = require('../../shared/errors');
const repository = require('./repository');
const model = require('./model');
const writer = require('./writer');
const suggestions = require('./suggestions');
const {
    resolveSettings,
    serverDefaults,
    sanitizeUserSettings,
} = require('./settings');
const { itemFingerprint } = require('./core/fingerprint');

const RUNS_LIMIT = 30;
const MARKS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

async function getSettings(user) {
    const ui = await repository.findUiSettings(user.id);
    return {
        settings: resolveSettings(ui),
        defaults: serverDefaults(),
        ai_configured: await model.isConfigured(user.id),
        health: await repository.classifyHealth(user.id),
    };
}

// Puts the items that gave up, or waited for a provider, back in the queue.
async function retryFailed(user, now = new Date()) {
    const requeued = await repository.requeueFailed(user.id, now);
    if (requeued > 0) require('./worker').wake();
    return { requeued };
}

async function updateSettings(user, body) {
    const clean = sanitizeUserSettings(body);
    if (!clean) throw new ValidationError('Invalid classification settings');
    const ui = await repository.findUiSettings(user.id);
    const previous =
        ui.classify && typeof ui.classify === 'object' ? ui.classify : {};
    const next = {
        ...previous,
        ...clean,
        thresholds: {
            ...(previous.thresholds || {}),
            ...(clean.thresholds || {}),
        },
    };
    await repository.saveClassifySettings(user.id, next);
    model.forgetCatalog(user.id);
    return getSettings(user);
}

// A change still holds while its item is exactly as the classifier left it.
async function isActive(userId, change) {
    if (change.dry_run || change.undone_at || !change.after_fingerprint)
        return false;
    if (Object.keys(change.after || {}).length === 0) return false;
    const item = await repository.loadItem(
        userId,
        change.entity,
        change.item_uid
    );
    return Boolean(item) && itemFingerprint(item) === change.after_fingerprint;
}

async function serializeChange(userId, change) {
    return {
        id: change.id,
        run_id: change.run_id,
        entity: change.entity,
        item_uid: change.item_uid,
        item_title: change.item_title,
        before: change.before,
        after: change.after,
        confidences: change.confidences,
        asked: change.asked,
        dry_run: change.dry_run,
        undone_at: change.undone_at,
        created_at: change.created_at,
        undoable: await isActive(userId, change),
    };
}

async function listRuns(user, { limit = RUNS_LIMIT } = {}) {
    const recent = await repository.Change.findAll({
        where: { user_id: user.id },
        attributes: ['run_id'],
        group: ['run_id'],
        order: [
            [
                repository.Change.sequelize.fn(
                    'MAX',
                    repository.Change.sequelize.col('id')
                ),
                'DESC',
            ],
        ],
        limit,
        raw: true,
    });
    const runIds = recent.map((row) => row.run_id);
    if (runIds.length === 0) return { runs: [] };
    const changes = await repository.Change.findAll({
        where: { user_id: user.id, run_id: { [Op.in]: runIds } },
        order: [['id', 'ASC']],
    });
    const runs = new Map(runIds.map((id) => [id, { run_id: id, changes: [] }]));
    for (const change of changes) {
        runs.get(change.run_id).changes.push(
            await serializeChange(user.id, change)
        );
    }
    return {
        runs: [...runs.values()].map((run) => ({
            ...run,
            created_at: run.changes[0]?.created_at ?? null,
            dry_run: run.changes.every((change) => change.dry_run),
            undoable: run.changes.filter((change) => change.undoable).length,
        })),
    };
}

// Active marks: one item (entity + uid), or every item of the last days.
async function listMarks(user, { entity, uid } = {}) {
    const where = { user_id: user.id, dry_run: false, undone_at: null };
    if (entity || uid) {
        if (
            !repository.ENTITIES.includes(entity) ||
            typeof uid !== 'string' ||
            !uid
        ) {
            throw new ValidationError('entity and uid are required together');
        }
        where.entity = entity;
        where.item_uid = uid;
    } else {
        where.created_at = {
            [Op.gte]: new Date(Date.now() - MARKS_DAYS * DAY_MS),
        };
    }
    const changes = await repository.Change.findAll({
        where,
        order: [['id', 'DESC']],
    });
    const marks = [];
    for (const change of changes) {
        if (await isActive(user.id, change)) {
            marks.push({
                change_id: change.id,
                run_id: change.run_id,
                entity: change.entity,
                item_uid: change.item_uid,
                fields: Object.keys(change.after),
                after: change.after,
                created_at: change.created_at,
            });
        }
    }
    return { marks };
}

async function undoOne(user, change, now) {
    if (change.dry_run) throw new ValidationError('A dry run wrote nothing');
    if (change.undone_at) throw new ConflictError('Already undone');
    if (!(await isActive(user.id, change))) {
        throw new ConflictError('The item changed since it was classified');
    }
    await writer.undoChange(user, change);
    await change.update({ undone_at: now });
}

async function undoChange(user, id, now = new Date()) {
    const change = await repository.Change.findOne({
        where: { id: Number(id) || 0, user_id: user.id },
    });
    if (!change) throw new NotFoundError('Change not found');
    await undoOne(user, change, now);
    return { change: await serializeChange(user.id, change) };
}

// Every change of a pass that still holds; the others are reported.
async function undoRun(user, runId, now = new Date()) {
    const changes = await repository.Change.findAll({
        where: {
            user_id: user.id,
            run_id: String(runId),
            dry_run: false,
            undone_at: null,
        },
    });
    if (changes.length === 0)
        throw new NotFoundError('Nothing to undo in this pass');
    let undone = 0;
    const refused = [];
    for (const change of changes) {
        try {
            await undoOne(user, change, now);
            undone += 1;
        } catch (error) {
            refused.push({
                change_id: change.id,
                item_title: change.item_title,
                error: error.message,
            });
        }
    }
    return { undone, refused };
}

async function dryRun(user, body = {}) {
    const days = Number(body.days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
        throw new ValidationError('days must be a whole number from 1 to 30');
    }
    const fresh = await repository.findUser(user.id);
    return require('./worker').dryRun(fresh, { days });
}

// The cards of the "À trier" queue (docs/40-triage.md).
async function queueItems(user) {
    const pending = await suggestions.listPending(user.id);
    return pending.map((suggestion) => ({
        key: `classify:${suggestion.uid}`,
        type: 'classify',
        source: 'classify',
        task_uid: suggestion.entity === 'task' ? suggestion.item_uid : null,
        action: 'classify',
        payload: {
            suggestion_uid: suggestion.uid,
            entity: suggestion.entity,
            item_uid: suggestion.item_uid,
            ...suggestion.payload,
        },
        reason: 'Classement à confirmer',
        details: [],
        question: null,
    }));
}

module.exports = {
    getSettings,
    updateSettings,
    listRuns,
    listMarks,
    undoChange,
    undoRun,
    dryRun,
    retryFailed,
    queueItems,
    listSuggestions: (user) => suggestions.listPending(user.id),
    applySuggestion: (user, uid, choice) =>
        suggestions.apply(user, uid, choice),
    dismissSuggestion: (user, uid) => suggestions.dismiss(user, uid),
};

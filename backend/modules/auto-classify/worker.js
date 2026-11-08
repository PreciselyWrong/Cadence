'use strict';

// Background classification of new items (docs/41-auto-classify.md). New
// tasks, notes and links are found in the offline sync journal, which every
// write path feeds (web, Android, MCP, Telegram, imports): no polling of the
// item tables. Each one waits for its grace period, a link also for its page
// to be read, then the empty fields are filled in batches. A failed call is
// tried again later, up to `max_attempts`.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { logger } = require('../../services/logService');
const repository = require('./repository');
const model = require('./model');
const suggestions = require('./suggestions');
const writer = require('./writer');
const { resolveSettings } = require('./settings');
const { slotsOf } = require('./core/eligibility');
const { decide, indexCatalog } = require('./core/validate');
const { findDuplicate } = require('./core/duplicates');
const { isSummarizable } = require('./core/summary');
const { itemFingerprint } = require('./core/fingerprint');

const CURSOR_KEY = 'auto_classify_journal_cursor';
const SINCE_KEY = 'auto_classify_since';
const JOURNAL_PAGE = 500;
const DUE_PAGE = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// Only rows created this recently count as new: an old item edited today
// was never waiting for its classification.
const NEW_FOR_MS = 2 * DAY_MS;
const ITEM_KEEP_MS = 30 * DAY_MS;
const HOUSEKEEPING_EVERY_MS = 6 * 60 * MINUTE_MS;
const BACKOFF_MAX_MINUTES = 60;
const FINAL_STATES = ['done', 'skipped', 'changed', 'failed'];

const state = {
    enabled: process.env.NODE_ENV !== 'test',
    running: null,
    again: false,
    timer: null,
    lastHousekeeping: 0,
};

function configure(options = {}) {
    if ('enabled' in options) state.enabled = options.enabled;
}

const newRunId = () =>
    `run_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

// Status or code first, then the message: "401: invalid x-api-key".
const errorText = (error) => {
    const head = error?.status ?? error?.code;
    const message = error?.message ?? String(error);
    return (head ? `${head}: ${message}` : message).slice(0, 255);
};

// A journal row was committed; a burst of them makes one pass.
function wake() {
    if (!state.enabled) return;
    if (state.running) {
        state.again = true;
        return;
    }
    state.running = (async () => {
        do {
            state.again = false;
            try {
                await runOnce(new Date());
            } catch (error) {
                logger.error(
                    { error: errorText(error) },
                    'Auto-classify pass failed'
                );
            }
        } while (state.again);
        await scheduleNext();
    })().finally(() => {
        state.running = null;
    });
}

// The next item due wakes the worker; nothing else ticks.
async function scheduleNext(now = Date.now()) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    const next = await repository.Item.min('next_attempt_at', {
        where: { state: { [Op.in]: ['queued', 'waiting'] } },
    });
    if (!next) return;
    const delay = Math.max(new Date(next).getTime() - now, 1000);
    state.timer = setTimeout(wake, Math.min(delay, DAY_MS));
    state.timer.unref?.();
}

function userSettingsCache() {
    const cache = new Map();
    return async (userId) => {
        if (!cache.has(userId)) {
            const user = await repository.findUser(userId);
            cache.set(
                userId,
                user
                    ? { user, settings: resolveSettings(user.ui_settings) }
                    : null
            );
        }
        return cache.get(userId);
    };
}

async function considerJournalRow(row, now, since, settingsOf) {
    const existing = await repository.Item.findOne({
        where: { user_id: row.user_id, entity: row.entity, item_uid: row.uid },
    });
    if (existing) {
        // A link whose page was just read: no need to wait any longer.
        if (existing.state === 'waiting') {
            await existing.update({ state: 'queued', next_attempt_at: now });
        }
        return;
    }
    const owner = await settingsOf(row.user_id);
    if (!owner || !owner.settings.enabled) return;
    const createdAt = await repository.createdAtOf(
        row.user_id,
        row.entity,
        row.uid
    );
    if (!createdAt || createdAt < since) return;
    if (now - createdAt > NEW_FOR_MS) return;
    await repository.Item.findOrCreate({
        where: { user_id: row.user_id, entity: row.entity, item_uid: row.uid },
        defaults: {
            state: 'queued',
            item_created_at: createdAt,
            next_attempt_at: new Date(
                createdAt.getTime() + owner.settings.grace_seconds * 1000
            ),
        },
    });
}

// Reads the journal from the last position. The first pass only takes the
// position: what existed before the classifier was installed stays as is.
async function ingest(now) {
    const stored = await repository.settingValue(CURSOR_KEY);
    if (stored === null) {
        await repository.setSetting(
            CURSOR_KEY,
            await repository.maxJournalId()
        );
        await repository.setSetting(SINCE_KEY, now.toISOString());
        return;
    }
    let cursor = Number(stored);
    const since = new Date((await repository.settingValue(SINCE_KEY)) ?? 0);
    const settingsOf = userSettingsCache();
    for (;;) {
        const rows = await repository.journalAfter(cursor, JOURNAL_PAGE);
        for (const row of rows) {
            await considerJournalRow(row, now, since, settingsOf);
            cursor = row.id;
        }
        if (rows.length > 0) await repository.setSetting(CURSOR_KEY, cursor);
        if (rows.length < JOURNAL_PAGE) return;
    }
}

async function retry(row, error, settings, now) {
    const attempts = row.attempts + 1;
    const minutes = Math.min(2 ** (attempts - 1), BACKOFF_MAX_MINUTES);
    await row.update({
        attempts,
        state: attempts >= settings.max_attempts ? 'failed' : 'queued',
        next_attempt_at: new Date(now.getTime() + minutes * MINUTE_MS),
        last_error: errorText(error),
    });
}

// Records the decision for one item and writes it, unless the item changed
// since it was read. `row` is the item's queue row (null in a dry run on
// demand). Answers what was done, for reports.
async function settle(user, entry, raw, context) {
    const { index, catalog, settings, runId, now, dry } = context;
    const { row } = entry;
    const finish = (values) =>
        row ? row.update({ run_id: runId, last_error: null, ...values }) : null;
    const result = decide(raw, entry, index, settings);
    const writes = Object.keys(result.apply).length > 0;
    if (!writes && !result.ask) {
        await finish({ state: 'done' });
        return { uid: entry.item.uid, outcome: 'nothing' };
    }
    const current = await repository.loadItem(
        user.id,
        entry.item.entity,
        entry.item.uid
    );
    if (!current || itemFingerprint(current) !== entry.fingerprint) {
        await finish({ state: 'changed' });
        return { uid: entry.item.uid, outcome: 'changed' };
    }
    const base = {
        user_id: user.id,
        run_id: runId,
        entity: current.entity,
        item_uid: current.uid,
        item_title: repository.itemTitle(current),
        confidences: result.confidences,
        asked: result.ask,
    };
    if (dry) {
        const plan = writer.planWrite(current, result.apply);
        await repository.Change.create({
            ...base,
            before: plan.before,
            after: plan.after,
            dry_run: true,
        });
        await finish({ state: 'done' });
        return {
            uid: current.uid,
            outcome: 'dry_run',
            after: plan.after,
            asked: result.ask,
        };
    }
    if (writes) {
        const written = await writer.applyDecision(user, current, result.apply);
        const after = await repository.loadItem(
            user.id,
            current.entity,
            current.uid
        );
        await repository.Change.create({
            ...base,
            before: written.before,
            after: written.after,
            after_fingerprint: after ? itemFingerprint(after) : null,
        });
    }
    if (result.ask) {
        await suggestions.createClassify(
            user,
            current,
            result.ask,
            catalog,
            runId,
            settings,
            now
        );
    }
    await finish({ state: 'done' });
    return { uid: current.uid, outcome: 'written', asked: result.ask };
}

// Prepares an item: null when there is nothing to ask the model (the queue
// row is settled here), or { row, item, slots, fingerprint }.
async function prepare(user, row, item, context) {
    const { settings, runId, now, dry } = context;
    if (!item) {
        if (row) await row.update({ state: 'skipped', run_id: runId });
        return null;
    }
    if (item.entity === 'link') {
        const waitUntil =
            new Date(item.created_at).getTime() +
            settings.fetch_wait_minutes * MINUTE_MS;
        if (
            row &&
            item.fetch_status === 'pending' &&
            now.getTime() < waitUntil
        ) {
            await row.update({
                state: 'waiting',
                next_attempt_at: new Date(waitUntil),
            });
            return null;
        }
        const found = findDuplicate(
            item,
            await repository.linksOfUser(user.id)
        );
        if (found) {
            if (dry) {
                await repository.Change.create({
                    user_id: user.id,
                    run_id: runId,
                    entity: 'link',
                    item_uid: item.uid,
                    item_title: repository.itemTitle(item),
                    before: {},
                    after: {},
                    asked: {
                        duplicate_of: found.original.uid,
                        reason: found.reason,
                    },
                    dry_run: true,
                });
            } else {
                await suggestions.createDuplicate(
                    user,
                    item,
                    found,
                    runId,
                    settings,
                    now
                );
            }
            if (row) await row.update({ state: 'done', run_id: runId });
            return null;
        }
    }
    const slots = slotsOf(item);
    if (slots?.summary && !isSummarizable(item)) slots.summary = false;
    if (!slots || !Object.values(slots).some(Boolean)) {
        if (row) await row.update({ state: 'skipped', run_id: runId });
        return null;
    }
    return { row, item, slots, fingerprint: itemFingerprint(item) };
}

async function classifyEntries(user, entries, settings, context) {
    const results = [];
    if (entries.length === 0) return results;
    const catalog = await model.catalogFor(user.id, settings);
    const full = {
        ...context,
        catalog,
        index: indexCatalog(catalog),
        settings,
    };
    for (let start = 0; start < entries.length; start += settings.batch_size) {
        const batch = entries.slice(start, start + settings.batch_size);
        let answers;
        try {
            answers = await model.askModel(user.id, catalog, batch, settings);
        } catch (error) {
            logger.error(
                { error: errorText(error), userId: user.id },
                'Auto-classify model call failed'
            );
            for (const entry of batch) {
                if (entry.row)
                    await retry(entry.row, error, settings, context.now);
                results.push({ uid: entry.item.uid, outcome: 'error' });
            }
            continue;
        }
        const answerOf = new Map(
            (Array.isArray(answers) ? answers : []).map((a) => [a?.uid, a])
        );
        for (const entry of batch) {
            try {
                results.push(
                    await settle(
                        user,
                        entry,
                        answerOf.get(entry.item.uid),
                        full
                    )
                );
            } catch (error) {
                logger.error(
                    { error: errorText(error), userId: user.id },
                    'Auto-classify write failed'
                );
                if (entry.row)
                    await retry(entry.row, error, settings, context.now);
                results.push({ uid: entry.item.uid, outcome: 'error' });
            }
        }
    }
    return results;
}

async function processUser(userId, rows, now) {
    const user = await repository.findUser(userId);
    const settings = user ? resolveSettings(user.ui_settings) : null;
    if (!user || !settings.enabled) {
        for (const row of rows) await row.update({ state: 'skipped' });
        return;
    }
    const context = {
        runId: newRunId(),
        now,
        dry: settings.mode === 'dry_run',
    };
    const entries = [];
    for (const row of rows) {
        const item = await repository.loadItem(
            userId,
            row.entity,
            row.item_uid
        );
        const entry = await prepare(user, row, item, { ...context, settings });
        if (entry) entries.push(entry);
    }
    if (entries.length > 0 && !(await model.isConfigured(userId))) {
        for (const entry of entries) {
            await entry.row.update({
                state: 'skipped',
                last_error: 'AI_NOT_CONFIGURED',
            });
        }
        return;
    }
    await classifyEntries(user, entries, settings, context);
}

async function processDue(now) {
    const rows = await repository.Item.findAll({
        where: {
            state: { [Op.in]: ['queued', 'waiting'] },
            next_attempt_at: { [Op.lte]: now },
        },
        order: [['next_attempt_at', 'ASC']],
        limit: DUE_PAGE,
    });
    const byUser = new Map();
    for (const row of rows) {
        byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
    }
    for (const [userId, userRows] of byUser) {
        try {
            await processUser(userId, userRows, now);
        } catch (error) {
            logger.error(
                { error: errorText(error), userId },
                'Auto-classify failed for a user'
            );
        }
    }
}

async function housekeeping(now) {
    if (now.getTime() - state.lastHousekeeping < HOUSEKEEPING_EVERY_MS) return;
    state.lastHousekeeping = now.getTime();
    await suggestions.expire(now);
    await repository.Item.destroy({
        where: {
            state: { [Op.in]: FINAL_STATES },
            item_created_at: {
                [Op.lt]: new Date(now.getTime() - ITEM_KEEP_MS),
            },
        },
    });
    const owners = await repository.Change.findAll({
        attributes: ['user_id'],
        group: ['user_id'],
        raw: true,
    });
    for (const { user_id: userId } of owners) {
        const user = await repository.findUser(userId);
        const days = resolveSettings(user?.ui_settings).log_retention_days;
        await repository.Change.destroy({
            where: {
                user_id: userId,
                created_at: {
                    [Op.lt]: new Date(now.getTime() - days * DAY_MS),
                },
            },
        });
    }
}

async function runOnce(now = new Date()) {
    await ingest(now);
    await processDue(now);
    await housekeeping(now);
}

// A dry run on demand: the user's items created in the last `days` days,
// classified as they are now, nothing written and no card made.
async function dryRun(user, { days = 7, limit = 48, now = new Date() } = {}) {
    const settings = resolveSettings(user.ui_settings);
    const context = { runId: newRunId(), now, dry: true };
    const from = new Date(now.getTime() - days * DAY_MS);
    const refs = await repository.recentItems(user.id, from, limit);
    const entries = [];
    for (const ref of refs) {
        const item = await repository.loadItem(user.id, ref.entity, ref.uid);
        const entry = await prepare(user, null, item, { ...context, settings });
        if (entry) entries.push(entry);
    }
    if (entries.length > 0 && !(await model.isConfigured(user.id))) {
        return {
            run_id: context.runId,
            considered: refs.length,
            results: [],
            error: 'AI_NOT_CONFIGURED',
        };
    }
    const results = await classifyEntries(user, entries, settings, context);
    return { run_id: context.runId, considered: refs.length, results };
}

// Every write path reaches the journal; its commit wakes the worker.
function install({ SyncChange }) {
    SyncChange.addHook('afterCreate', 'autoClassify', (row, options) => {
        if (!state.enabled || !repository.ENTITIES.includes(row.entity)) return;
        if (options?.transaction?.afterCommit) {
            options.transaction.afterCommit(() => wake());
        } else {
            setImmediate(wake);
        }
    });
}

function initialize() {
    wake();
}

// Waits for a pass in flight (tests, shutdown).
async function drain() {
    while (state.running) await state.running;
}

module.exports = {
    configure,
    install,
    initialize,
    wake,
    runOnce,
    dryRun,
    drain,
    CURSOR_KEY,
    SINCE_KEY,
};

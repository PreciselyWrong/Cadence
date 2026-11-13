'use strict';

// Agent proposals (docs/47-proposals.md): Cadence computes the facts of a
// week or a review, an agent judges them through a plugin event, Cadence
// validates the answer, and the user applies the checked parts. The agent
// never writes; every change goes through the existing write paths.
const moment = require('moment-timezone');
const {
    ConflictError,
    NotFoundError,
    ValidationError,
} = require('../../shared/errors');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { serializeTasks } = require('../tasks/core/serializers');
const { isRecurring } = require('../daily-plan/planningSettings');
const { toolsFor } = require('../triage/actions');
const dispatcher = require('../webhooks/dispatcher');
const { logError } = require('../../services/logService');
const reviewService = require('../review/service');
const dailyPlan = require('../daily-plan/service');
const calendarFeeds = require('../calendar-feeds/service');
const repository = require('./repository');
const { cleanText } = require('./core/text');
const { listDays } = require('./core/day');
const { resolvePeriod, weekFacts } = require('./core/week');
const { reviewFacts, choicesFor } = require('./core/review');
const { validateAnswer } = require('./core/answer');

const KINDS = new Set(['week', 'review']);
const STATUS_FILTERS = new Set([
    'pending',
    'ready',
    'failed',
    'applied',
    'dismissed',
]);
const JUDGED_REVIEWS = 20;
// A pending proposal the agent has not answered within this time is failed
// with 'timeout', so the user can ask again instead of waiting forever.
const PENDING_TIMEOUT_MINUTES = 10;
// Task priority is stored as 0 (low), 1 (medium), 2 (high). The agent only
// needs the ones that are not the default.
const PRIORITY_SHOWN = { 1: 'medium', 2: 'high' };
const ERROR_CODE = /^[a-z_]{1,64}$/;

const TITLES = {
    week: { ready: 'Your week is ready', failed: 'Your week was not prepared' },
    review: {
        ready: 'Your review is ready',
        failed: 'Your review was not prepared',
    },
};

const todayIn = (timezone) => moment.tz(timezone).format('YYYY-MM-DD');

// What the agent receives: the facts without the bookkeeping that decides
// reuse (`stamps`).
const agentFacts = ({ stamps: _stamps, ...facts }) => facts;

function serialize(row, { withFacts = false } = {}) {
    const out = {
        uid: row.uid,
        kind: row.kind,
        status: row.status,
        period_start: row.period_start ?? null,
        period_end: row.period_end ?? null,
        answer: row.answer ?? null,
        error: row.error ?? null,
        reply_text: row.reply_text ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
    if (withFacts) out.facts = agentFacts(row.facts);
    return out;
}

// Marks a pending proposal whose last change is older than the timeout as
// failed. A reply restarts the clock (it moves updated_at).
async function expireIfStale(row) {
    if (!row || row.status !== 'pending') return row;
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age < PENDING_TIMEOUT_MINUTES * 60 * 1000) return row;
    await row.update({ status: 'failed', error: 'timeout' });
    await notifyOutcome(row);
    return row;
}

function ensureOpen(row, statuses, message) {
    if (!statuses.includes(row.status)) throw new ConflictError(message);
}

async function requestAgent(row, extra = {}) {
    try {
        await dispatcher.emit(row.user_id, 'proposal.requested', {
            text: `Proposal requested: ${row.kind}`,
            data: {
                uid: row.uid,
                kind: row.kind,
                facts: agentFacts(row.facts),
                ...extra,
            },
        });
    } catch (error) {
        logError({ error, proposalUid: row.uid }, 'Proposal request failed');
    }
}

async function notifyOutcome(row) {
    const ready = row.status === 'ready';
    await repository.notify({
        userId: row.user_id,
        type: 'proposal',
        title: TITLES[row.kind][ready ? 'ready' : 'failed'],
        level: ready ? 'success' : 'error',
        data: { proposal_uid: row.uid, kind: row.kind, status: row.status },
        sources: [],
    });
}

const dayOf = (value) => {
    if (!value) return null;
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

// Calendar events of the period the agenda shows. A failing calendar leaves
// the week without events rather than failing the whole proposal.
async function periodEvents(user, period) {
    try {
        const { events } = await calendarFeeds.eventsForRangeOfDays(
            user,
            period.start,
            period.end
        );
        return events.map((event) => ({
            title: event.title,
            date: event.date,
            start: event.start,
            end: event.end,
        }));
    } catch (error) {
        logError({ error }, 'Proposal calendar events unavailable');
        return [];
    }
}

async function computeWeek(user, { start, end }, timezone, today) {
    const period = resolvePeriod({ today, start, end });
    const weekStart = reviewService.weekStartOf(
        today,
        user.first_day_of_week ?? 1
    );
    const days = listDays(period.start, period.end);
    const planViews = await Promise.all(
        days.map((date) => dailyPlan.getPlan(user, date))
    );
    const plans = new Map(
        days.map((date, i) => [
            date,
            (planViews[i].plan?.items ?? []).map((item) => ({
                task_uid: item.task_uid,
                duration_minutes: item.duration_minutes,
            })),
        ])
    );
    const plannedUids = [...plans.values()].flat().map((item) => item.task_uid);
    const [candidates, events] = await Promise.all([
        repository.findWeekCandidates(user.id, {
            periodEnd: period.end,
            weekStart,
            plannedUids,
        }),
        periodEvents(user, period),
    ]);
    const serialized = await serializeTasks(candidates, timezone, {
        preserveOriginalName: true,
    });
    const tasks = serialized.map((task) => ({
        uid: task.uid,
        name: cleanText(task.name, 255),
        due: dayOf(task.due_date),
        project: task.Project?.name ?? null,
        priority: PRIORITY_SHOWN[task.priority] ?? null,
        estimate_min: task.estimated_minutes ?? null,
        week_of: dayOf(task.week_of),
        in_view: Boolean(task.in_view),
        someday: (task.tags ?? []).some((tag) => tag.name === 'someday'),
        recurring: isRecurring(task),
        subtask: Boolean(task.parent_task_id),
    }));
    return {
        period,
        facts: weekFacts({
            today,
            period,
            weekStart,
            tasks,
            plans,
            events,
        }),
    };
}

// The quick review queue, read from the review's own lists.
async function computeReview(user) {
    const query = { limit: 200 };
    const [pushed, later, stale] = await Promise.all([
        reviewService.getCategory(user, 'pushed', query),
        reviewService.getCategory(user, 'later', query),
        reviewService.getCategory(user, 'stale', query),
    ]);
    const normalize = (item) => ({
        uid: item.task.uid,
        name: item.task.name,
        project: item.task.Project?.name ?? null,
        updated_at: item.task.updated_at,
        reviewed_at: item.task.reviewed_at ?? null,
        last_activity_at: new Date(item.task.updated_at).toISOString(),
        review_due: Boolean(item.review_due),
        pushed_times: item.push?.recent_count ?? 0,
    });
    return reviewFacts({
        lists: {
            pushed: pushed.items.map(normalize),
            later: later.items.map(normalize),
            stale: stale.items.map(normalize),
        },
        previous: await previousJudgements(user.id),
    });
}

// The latest judgement of each task, from the newest review answer that
// holds one, with the task's updated_at it was given at.
async function previousJudgements(userId) {
    const rows = await repository.findJudgedReviews(userId, JUDGED_REVIEWS);
    const judged = new Map();
    for (const row of rows) {
        const stamps = row.facts?.stamps ?? {};
        for (const item of row.answer?.items ?? []) {
            if (judged.has(item.task_uid) || !stamps[item.task_uid]) continue;
            judged.set(item.task_uid, {
                stamp: stamps[item.task_uid],
                choice: item.choice,
                reason: item.reason,
            });
        }
    }
    return judged;
}

// The review answer kept on the proposal: the judged items, then the reused
// ones, so the answer alone tells what to apply.
const reviewAnswer = (summary, judgedItems, cached) => ({
    summary,
    items: [
        ...judgedItems,
        ...cached.map((item) => ({
            task_uid: item.task_uid,
            choice: item.choice,
            reason: item.reason,
            cached: true,
        })),
    ],
});

async function createProposal(user, { kind, start, end } = {}) {
    if (!KINDS.has(kind)) {
        throw new ValidationError('kind must be week or review');
    }
    const pending = await repository.findPending(user.id, kind);
    if (pending) {
        const current = await expireIfStale(pending);
        if (current.status === 'pending') {
            return { row: current, created: false };
        }
    }

    const timezone = getSafeTimezone(user.timezone);
    const today = todayIn(timezone);
    const base = { user_id: user.id, kind, status: 'pending' };
    if (kind === 'week') {
        const { period, facts } = await computeWeek(
            user,
            { start, end },
            timezone,
            today
        );
        const row = await repository.create({
            ...base,
            period_start: period.start,
            period_end: period.end,
            facts,
        });
        await requestAgent(row);
        return { row, created: true };
    }

    const { facts } = await computeReview(user);
    const row = await repository.create({ ...base, facts });
    if (facts.items.length === 0) {
        await row.update({
            status: 'ready',
            answer: reviewAnswer('', [], facts.cached),
        });
        return { row, created: true };
    }
    await requestAgent(row);
    return { row, created: true };
}

async function getProposal(user, uid) {
    const row = await repository.findByUid(user.id, uid);
    if (!row) throw new NotFoundError('Proposal not found');
    return serialize(await expireIfStale(row), { withFacts: true });
}

async function listProposals(user, { status } = {}) {
    if (status !== undefined && !STATUS_FILTERS.has(status)) {
        throw new ValidationError(
            `status must be one of ${[...STATUS_FILTERS].join(', ')}`
        );
    }
    const rows = await repository.findLatestPerKind(user.id, status ?? null);
    const current = await Promise.all(rows.map(expireIfStale));
    return current
        .filter((row) => !status || row.status === status)
        .map((row) => serialize(row));
}

// Agent side. A failure is kept with its short code; an answer goes through
// validateAnswer and is refused as failed when nothing usable is left.
async function answerProposal(user, uid, body = {}) {
    const row = await expireIfStale(await repository.findByUid(user.id, uid));
    if (!row) throw new NotFoundError('Proposal not found');
    ensureOpen(row, ['pending'], 'Proposal is not waiting for an answer');

    let failure = null;
    let answer = null;
    if (body.error !== undefined && body.error !== null) {
        const code = String(body.error).toLowerCase();
        failure = ERROR_CODE.test(code) ? code : 'agent_error';
    } else {
        const checked = validateAnswer(row.kind, row.facts, body.answer);
        if (checked.error) {
            failure = checked.error;
        } else if (row.kind === 'review') {
            answer = reviewAnswer(
                checked.answer.summary,
                checked.answer.items,
                row.facts.cached ?? []
            );
        } else {
            answer = checked.answer;
        }
    }

    await row.update(
        failure
            ? { status: 'failed', error: failure, answer: null }
            : { status: 'ready', error: null, answer }
    );
    await notifyOutcome(row);
    return serialize(row);
}

// A new version of a ready proposal: same facts, the user's words, and the
// answer that was given, so the agent can revise it.
async function replyProposal(user, uid, body = {}) {
    const row = await repository.findByUid(user.id, uid);
    if (!row) throw new NotFoundError('Proposal not found');
    ensureOpen(row, ['ready'], 'Proposal has no answer to reply to');
    const text = cleanText(body.text, 1000);
    if (!text) throw new ValidationError('text is required');

    await row.update({ status: 'pending', reply_text: text, error: null });
    await requestAgent(row, { reply: text, previous_answer: row.answer });
    return serialize(row);
}

// Changes of a week, by task. The operations are the ones the user can do
// by hand: a plan line on a day (the due date stays), this week, later, a
// new due date, dropped (cancelled, not deleted).
async function applyWeekChange(user, change) {
    const run = toolsFor(user);
    const id = change.task_uid;
    switch (change.op) {
        case 'plan_day':
            await dailyPlan.carryOver(user, change.date, [id]);
            return;
        case 'this_week':
            await run('update_task', {
                id,
                week_of: 'this_week',
                later: false,
            });
            return;
        case 'later':
            await run('update_task', { id, later: true });
            return;
        case 'due':
            await run('update_task', { id, due_date: change.date });
            return;
        case 'drop':
            await run('update_task', { id, status: 'cancelled' });
            return;
        default:
            throw new ValidationError(`Unknown operation ${change.op}`);
    }
}

// One review choice. Choices of a parked task also take it out of Later.
async function applyReviewChoice(user, uid, choice) {
    const run = toolsFor(user);
    switch (choice) {
        case 'do_today':
            await run('update_task', { id: uid, later: false });
            await dailyPlan.carryOver(user, 'today', [uid]);
            return;
        case 'this_week':
            await run('update_task', {
                id: uid,
                week_of: 'this_week',
                later: false,
            });
            return;
        case 'in_view':
            await run('update_task', { id: uid, in_view: true, later: false });
            return;
        case 'later':
            await run('update_task', { id: uid, later: true });
            return;
        case 'done':
            await run('complete_task', { id: uid });
            return;
        case 'drop':
            await run('update_task', { id: uid, status: 'cancelled' });
            return;
        case 'keep':
            return;
        default:
            throw new ValidationError(`Unknown choice ${choice}`);
    }
}

// One change at a time: a failed one is reported and the others still run.
async function attempt(taskUid, action) {
    try {
        await action();
        return { task_uid: taskUid, state: 'applied' };
    } catch (error) {
        logError({ error, taskUid }, 'Proposal change failed');
        return { task_uid: taskUid, state: 'failed', error: error.message };
    }
}

async function applyProposal(user, uid, body = {}) {
    const row = await repository.findByUid(user.id, uid);
    if (!row) throw new NotFoundError('Proposal not found');
    ensureOpen(row, ['ready', 'applied'], 'Proposal has no answer to apply');
    let results;

    if (row.kind === 'week') {
        const wanted = body.task_uids;
        if (
            !Array.isArray(wanted) ||
            wanted.some((u) => typeof u !== 'string')
        ) {
            throw new ValidationError('task_uids must be a list of task uids');
        }
        const changes = row.answer?.changes ?? [];
        const chosen = wanted.map((taskUid) => {
            const change = changes.find((c) => c.task_uid === taskUid);
            if (!change) {
                throw new ValidationError(`Task ${taskUid} is not proposed`);
            }
            return change;
        });
        results = [];
        for (const change of chosen) {
            results.push(
                await attempt(change.task_uid, () =>
                    applyWeekChange(user, change)
                )
            );
        }
    } else {
        const decisions = body.decisions;
        if (!Array.isArray(decisions)) {
            throw new ValidationError('decisions must be a list');
        }
        const lists = new Map(
            [...(row.facts.items ?? []), ...(row.facts.cached ?? [])].map(
                (item) => [item.uid ?? item.task_uid, item.list]
            )
        );
        const checked = decisions.map((decision) => {
            const list = lists.get(decision?.task_uid);
            if (!list || !choicesFor(list).includes(decision.choice)) {
                throw new ValidationError(
                    `Decision for ${decision?.task_uid} is not allowed`
                );
            }
            return decision;
        });
        results = [];
        for (const decision of checked) {
            results.push(
                await attempt(decision.task_uid, () =>
                    applyReviewChoice(user, decision.task_uid, decision.choice)
                )
            );
        }
    }

    await row.update({ status: 'applied' });
    return { uid: row.uid, status: row.status, results };
}

async function dismissProposal(user, uid) {
    const row = await repository.findByUid(user.id, uid);
    if (!row) throw new NotFoundError('Proposal not found');
    ensureOpen(
        row,
        ['pending', 'ready', 'failed'],
        'Proposal is already applied'
    );
    await row.update({ status: 'dismissed' });
    return { uid: row.uid, status: row.status };
}

module.exports = {
    createProposal,
    getProposal,
    listProposals,
    answerProposal,
    replyProposal,
    applyProposal,
    dismissProposal,
    agentFacts,
};

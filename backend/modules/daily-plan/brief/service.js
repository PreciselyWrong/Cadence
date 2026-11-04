'use strict';

// The daily brief's settings and read path (docs/39-daily-brief.md). Writing a
// brief (generation, Regenerate) is not here: this module only stores what the
// user chose and returns what was already built.
const permissionsService = require('../../../services/permissionsService');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const agentsService = require('../../agents/service');
const dailyPlanRepository = require('../repository');
const dailyPlanService = require('../service');
const briefRepository = require('./repository');
const { llmConfigured } = require('./sources');
const { checkPiper } = require('./piper');
const {
    normalizeBriefSettings,
    validateBriefSettingsUpdate,
    mergeBriefSettings,
} = require('./settings');

async function getBriefSettings(user) {
    const settings = await dailyPlanRepository.findUiSettings(user.id);
    return normalizeBriefSettings(settings.brief);
}

async function saveBriefSettings(user, patch) {
    validateBriefSettingsUpdate(patch);
    const settings = await dailyPlanRepository.findUiSettings(user.id);
    const next = normalizeBriefSettings(
        mergeBriefSettings(normalizeBriefSettings(settings.brief), patch)
    );
    await dailyPlanRepository.saveUiSettings(user.id, {
        ...settings,
        brief: next,
    });
    return next;
}

// Every task uid the brief points at, from all the sections that reference
// tasks. Unknown or malformed entries are skipped, not trusted.
function taskUidsOf(brief) {
    const uids = new Set();
    const add = (uid) => {
        if (typeof uid === 'string' && uid !== '') uids.add(uid);
    };
    const each = (list, read) => {
        if (Array.isArray(list)) list.forEach((item) => read(item));
    };

    each(brief.timeline, (day) => each(day?.task_uids, add));
    each(brief.tonight, (item) => add(item?.task_uid));
    each(brief.moves, (item) => add(item?.task_uid));
    each(brief.anticipate, (item) => each(item?.task_uids, add));
    each(brief.resolved, (item) => add(item?.task_uid));
    return [...uids];
}

function serializeTask(task) {
    return {
        uid: task.uid,
        name: task.name,
        status: task.status,
        due_date: task.due_date,
        completed_at: task.completed_at,
        estimated_minutes: task.estimated_minutes,
        priority: task.priority,
        project_name: task.Project?.name ?? null,
    };
}

// The brief keeps task uids only; this loads each referenced task as it is
// now, so a task finished elsewhere shows as finished.
async function loadCurrentTasks(user, brief) {
    const uids = brief ? taskUidsOf(brief) : [];
    if (uids.length === 0) return {};
    const visibleWhere = await permissionsService.ownershipOrPermissionWhere(
        'task',
        user.id
    );
    const tasks = await briefRepository.findVisibleTasksByUids(
        visibleWhere,
        uids
    );
    return Object.fromEntries(
        tasks.map((task) => [task.uid, serializeTask(task)])
    );
}

async function getBrief(user, date) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = dailyPlanService.resolvePlanDate(date, timezone);
    const row = await briefRepository.findBriefRow(user.id, planDate);
    const brief = row?.brief ?? null;

    return {
        date: planDate,
        brief,
        version: brief ? (row.brief_version ?? null) : null,
        status: brief ? (row.brief_status ?? null) : null,
        generated_at: brief ? (row.brief_generated_at ?? null) : null,
        tasks: await loadCurrentTasks(user, brief),
    };
}

// The Piper server is the only source asked from here: a short request to its
// voice list, with a few seconds timeout. Everything else is read from settings.
async function voiceSource(voice) {
    const configured = voice.enabled && Boolean(voice.piperUrl);
    if (!configured) {
        return {
            id: 'voice',
            configured,
            working: null,
            detail: null,
        };
    }
    const check = await checkPiper(voice.piperUrl);
    if (!check.ok) {
        return { id: 'voice', configured, working: false, detail: check.code };
    }
    return {
        id: 'voice',
        configured,
        working: true,
        detail: voice.voice ? null : 'voice_not_set',
    };
}

// Each optional source: whether it is set up, and whether it worked last time
// when that can be known without calling it (null otherwise). Calendar and
// agent settings are read only; the Piper server is asked (voiceSource).
async function getBriefStatus(user) {
    const settings = await getBriefSettings(user);
    const agent = await agentsService.getSettings(user);
    const agentReady = Boolean(agent.baseUrl && agent.api_key_set);
    const mailAgentReady = agentReady && Boolean(agent.profiles.mail);

    const feedUids = settings.calendarFeedUids;
    const feeds = await briefRepository.findCalendarFeedsByUids(
        user.id,
        feedUids
    );
    const failing = feeds.filter((feed) => feed.last_error);
    const calendarConfigured = feedUids.length > 0;

    const sources = [
        {
            id: 'calendar',
            configured: calendarConfigured,
            working: calendarConfigured ? failing.length === 0 : null,
            detail: failing.map((feed) => feed.last_error).join('; ') || null,
        },
        {
            id: 'mail',
            configured: settings.mail.enabled && mailAgentReady,
            working: null,
            detail: !settings.mail.enabled
                ? 'disabled'
                : mailAgentReady
                  ? null
                  : 'agent_not_configured',
        },
        {
            id: 'llm',
            configured: settings.llm.enabled && (await llmConfigured(user.id)),
            working: null,
            detail: !settings.llm.enabled ? 'disabled' : null,
        },
        await voiceSource(settings.voice),
        {
            id: 'agent',
            configured: agentReady,
            working: null,
            detail: agentReady ? null : 'not_configured',
        },
    ];

    return {
        sources,
        timezone_set: Boolean(user.timezone) && user.timezone !== 'UTC',
    };
}

module.exports = {
    getBriefSettings,
    saveBriefSettings,
    getBrief,
    getBriefStatus,
    taskUidsOf,
};

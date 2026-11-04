'use strict';

// The daily brief's settings and read path (docs/39-daily-brief.md). Writing a
// brief (generation, Regenerate) is not here: this module only stores what the
// user chose and returns what was already built.
const permissionsService = require('../../../services/permissionsService');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const dailyPlanRepository = require('../repository');
const dailyPlanService = require('../service');
const briefRepository = require('./repository');
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

module.exports = {
    getBriefSettings,
    saveBriefSettings,
    getBrief,
    taskUidsOf,
};

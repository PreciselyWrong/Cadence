'use strict';

const crypto = require('crypto');
const moment = require('moment-timezone');
const {
    processDueDateForStorage,
    utcToUserDateString,
} = require('../../utils/timezone-utils');

const DEFAULT_TASK_MINUTES = 60;
const MIN_TASK_MINUTES = 5;
const MAX_TASK_MINUTES = 720;
const STATUS_DONE = 2;
const STATUS_NOT_STARTED = 0;

function hash(value) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex');
}

const clean = (text) => (text || '').replace(/\r\n/g, '\n').trim();
// Google Tasks limits: title 1024, notes 8192 characters.
const clip = (text, max) => (text.length > max ? text.slice(0, max) : text);

const plusDay = (day) =>
    moment.utc(day, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');
const minusDay = (day) =>
    moment.utc(day, 'YYYY-MM-DD').subtract(1, 'day').format('YYYY-MM-DD');

const isDone = (task) => Number(task.status) === STATUS_DONE;

// ---- Google Tasks ----------------------------------------------------

// Google Tasks keeps only the day of a due date; its API has no time.
function localTaskProjection(task, timezone) {
    return {
        title: clip(clean(task.name), 1024),
        notes: clip(clean(task.note), 8192),
        completed: isDone(task),
        due: task.due_date
            ? utcToUserDateString(task.due_date, timezone)
            : null,
        parent: task.parent_task_id || null,
        project: task.project_id || null,
    };
}

function remoteTaskProjection(item, listId) {
    return {
        title: clean(item.title),
        notes: clean(item.notes),
        completed: item.status === 'completed',
        due: item.due ? String(item.due).slice(0, 10) : null,
        parent: item.parent || null,
        list: listId,
    };
}

function toGoogleTask(task, timezone) {
    const local = localTaskProjection(task, timezone);
    return {
        title: local.title || '(untitled)',
        notes: local.notes,
        status: local.completed ? 'completed' : 'needsAction',
        // Clearing a completed task's "completed" field is how Google
        // reopens it.
        completed: local.completed
            ? new Date(task.completed_at || Date.now()).toISOString()
            : null,
        due: local.due ? `${local.due}T00:00:00.000Z` : null,
    };
}

// Attributes to apply to a Tududi task from a Google task. Completion is
// returned apart because a recurring task advances instead of closing.
function fromGoogleTask(item, task, timezone) {
    const remote = remoteTaskProjection(item, null);
    const attrs = {};
    if (remote.title && remote.title !== clean(task?.name)) {
        attrs.name = remote.title;
    }
    if (remote.notes !== clean(task?.note)) attrs.note = remote.notes || null;

    const currentDue = task?.due_date
        ? utcToUserDateString(task.due_date, timezone)
        : null;
    // Same day: keep the time Tududi knows and Google cannot hold.
    if (remote.due !== currentDue) {
        attrs.due_date = remote.due
            ? processDueDateForStorage(remote.due, timezone)
            : null;
        attrs.due_has_time = false;
    }

    let completion = null;
    if (remote.completed && !(task && isDone(task))) completion = 'complete';
    if (!remote.completed && task && isDone(task)) completion = 'reopen';
    return { attrs, completion };
}

// ---- The Tududi calendar ---------------------------------------------

// Where a dated task sits on a calendar, matching how the Calendar page
// draws it: due time + estimate, start time to due time, or whole days.
function taskEventTimes(task, timezone) {
    if (!task.due_date) return null;
    if (task.due_has_time) {
        const due = moment(task.due_date);
        const start =
            task.start_date && task.start_has_time
                ? moment(task.start_date)
                : null;
        if (start && start.isBefore(due)) {
            return {
                allDay: false,
                start: start.toISOString(),
                end: due.toISOString(),
                mode: 'range',
            };
        }
        const minutes = task.estimated_minutes || DEFAULT_TASK_MINUTES;
        return {
            allDay: false,
            start: due.toISOString(),
            end: due.clone().add(minutes, 'minutes').toISOString(),
            mode: 'estimate',
        };
    }
    const lastDay = utcToUserDateString(task.due_date, timezone);
    const startDay = task.start_date
        ? utcToUserDateString(task.start_date, timezone)
        : null;
    const firstDay = startDay && startDay < lastDay ? startDay : lastDay;
    return {
        allDay: true,
        start: firstDay,
        end: plusDay(lastDay),
        mode: 'days',
    };
}

// A done task keeps its event, its title marked with this prefix.
const DONE_PREFIX = '✓ ';
const eventTitle = (task) =>
    (isDone(task) ? DONE_PREFIX : '') + clean(task.name);
// An event's title without the done mark, as the task's name.
const eventTaskName = (event) => {
    const title = clean(event.summary);
    return title.startsWith(DONE_PREFIX.trim())
        ? title.slice(DONE_PREFIX.trim().length).trim()
        : title;
};

function localEventProjection(task, timezone) {
    const times = taskEventTimes(task, timezone);
    if (!times) return null;
    return {
        title: eventTitle(task),
        allDay: times.allDay,
        start: times.start,
        end: times.end,
    };
}

function eventTimes(event) {
    if (event.start?.date) {
        return {
            allDay: true,
            start: event.start.date,
            end: event.end?.date || plusDay(event.start.date),
        };
    }
    return {
        allDay: false,
        start: new Date(event.start?.dateTime).toISOString(),
        end: new Date(
            event.end?.dateTime || event.start?.dateTime
        ).toISOString(),
    };
}

function remoteEventProjection(event) {
    return { title: clean(event.summary), ...eventTimes(event) };
}

function toGoogleEvent(task, timezone, taskUrl) {
    const times = taskEventTimes(task, timezone);
    const body = {
        summary: eventTitle(task) || '(untitled)',
        description: [clean(task.note), taskUrl].filter(Boolean).join('\n\n'),
        extendedProperties: { private: { tududiTaskUid: task.uid } },
        transparency: 'transparent',
    };
    if (times.allDay) {
        body.start = { date: times.start, dateTime: null };
        body.end = { date: times.end, dateTime: null };
    } else {
        body.start = { dateTime: times.start, timeZone: timezone, date: null };
        body.end = { dateTime: times.end, timeZone: timezone, date: null };
    }
    return body;
}

// Attributes for a Tududi task moved, resized or renamed in Google.
function fromGoogleEvent(event, task, timezone) {
    const attrs = {};
    const title = eventTaskName(event);
    if (title && title !== clean(task?.name)) attrs.name = title;

    const remote = eventTimes(event);
    const current = task ? taskEventTimes(task, timezone) : null;
    const same =
        current &&
        current.allDay === remote.allDay &&
        current.start === remote.start &&
        current.end === remote.end;
    if (same) return attrs;

    if (remote.allDay) {
        const lastDay = minusDay(remote.end);
        attrs.due_date = processDueDateForStorage(lastDay, timezone);
        attrs.due_has_time = false;
        if (remote.start < lastDay) {
            attrs.start_date = moment
                .tz(remote.start, 'YYYY-MM-DD', timezone)
                .startOf('day')
                .toDate();
            attrs.start_has_time = false;
        } else if (task?.start_date) {
            attrs.start_date = null;
            attrs.start_has_time = false;
        }
        return attrs;
    }

    const start = new Date(remote.start);
    const end = new Date(remote.end);
    if (current?.mode === 'range') {
        attrs.start_date = start;
        attrs.start_has_time = true;
        attrs.due_date = end;
        attrs.due_has_time = true;
        return attrs;
    }
    attrs.due_date = start;
    attrs.due_has_time = true;
    // A start left after the new due would put the task out of order.
    if (task?.start_date && new Date(task.start_date) > start) {
        attrs.start_date = null;
        attrs.start_has_time = false;
    }
    const minutes = Math.round((end - start) / 60000);
    if (minutes !== (task?.estimated_minutes || DEFAULT_TASK_MINUTES)) {
        attrs.estimated_minutes = Math.min(
            Math.max(minutes, MIN_TASK_MINUTES),
            MAX_TASK_MINUTES
        );
    }
    return attrs;
}

// ---- Events of other calendars, stored for display ---------------------

function storedEventFields(event) {
    const times = eventTimes(event);
    return {
        etag: event.etag || null,
        summary: event.summary || '',
        description: event.description || null,
        location: event.location || null,
        all_day: times.allDay,
        start_at: times.allDay ? null : new Date(times.start),
        end_at: times.allDay ? null : new Date(times.end),
        start_date: times.allDay ? times.start : null,
        end_date: times.allDay ? times.end : null,
        busy: event.transparency !== 'transparent',
        recurring_event_id: event.recurringEventId || null,
        html_link: event.htmlLink || null,
    };
}

module.exports = {
    hash,
    localTaskProjection,
    remoteTaskProjection,
    toGoogleTask,
    fromGoogleTask,
    taskEventTimes,
    localEventProjection,
    remoteEventProjection,
    toGoogleEvent,
    fromGoogleEvent,
    eventTaskName,
    storedEventFields,
    plusDay,
    minusDay,
    STATUS_DONE,
    STATUS_NOT_STARTED,
};

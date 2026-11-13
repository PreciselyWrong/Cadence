'use strict';

// Small hand-made inputs for the triage rules. Names are fictitious.
const TODAY = '2026-11-04'; // a Wednesday (weekday 3)

const SETTINGS = {
    calendarFeedUids: [],
    calendarLookaheadDays: 7,
    thresholds: {
        postponements: 3,
        duplicateSimilarity: 0.8,
        closedLookbackDays: 7,
    },
    alerts: { disabled: [] },
    triage: { enabled: false, dailyLimit: 20 },
};

// Deep-enough merge for the settings shape used by the rules.
function settingsWith(overrides = {}) {
    return {
        ...SETTINGS,
        ...overrides,
        thresholds: { ...SETTINGS.thresholds, ...(overrides.thresholds || {}) },
        alerts: { ...SETTINGS.alerts, ...(overrides.alerts || {}) },
    };
}

const task = (overrides = {}) => ({
    uid: 'task-a',
    name: 'Tâche fictive',
    note: null,
    status: 'not_started',
    due_date: null,
    parent_uid: null,
    project_name: null,
    tags: [],
    recurring: false,
    series_uid: null,
    ...overrides,
});

const event = (overrides = {}) => ({
    ref: 'event:feed-a:ev-1:2026-11-04T10:00',
    series_ref: null,
    feed_uid: 'feed-a',
    title: 'Réunion fictive',
    date: TODAY,
    all_day: false,
    start_minute: 600,
    end_minute: 660,
    busy: true,
    calendar: 'Agenda test',
    ...overrides,
});

const input = (overrides = {}) => ({
    today: TODAY,
    timezone: 'Europe/Paris',
    now: '2026-11-04T06:00:00Z',
    tasks: [],
    closedTasks: [],
    events: [],
    focusBlocksByDate: {},
    postponements: {},
    contexts: [],
    ...overrides,
});

module.exports = { TODAY, SETTINGS, settingsWith, task, event, input };

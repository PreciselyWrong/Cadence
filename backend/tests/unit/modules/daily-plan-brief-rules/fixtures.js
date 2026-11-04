'use strict';

// Small hand-made inputs for the brief rules. Names are fictitious.
const TODAY = '2026-11-04'; // a Wednesday (weekday 3)

const SETTINGS = {
    enabled: true,
    time: '07:00',
    days: [],
    sections: [
        'verdict',
        'timeline',
        'tonight',
        'moves',
        'anticipate',
        'replies',
        'inbox',
        'resolved',
    ],
    timelineDays: 3,
    calendarFeedUids: [],
    calendarLookaheadDays: 7,
    priorities: [
        'consequence',
        'blocking',
        'money_deadline',
        'planned_load',
        'long_term',
    ],
    thresholds: {
        postponements: 3,
        duplicateSimilarity: 0.8,
        maxMoves: 3,
        maxTonight: 3,
        closedLookbackDays: 7,
    },
    capacity: { evening: {}, dayNotes: {} },
    alerts: { disabled: [], noise: { minVotes: 3, ratio: 0.7 } },
};

// Deep-enough merge for the settings shape used by the rules.
function settingsWith(overrides = {}) {
    return {
        ...SETTINGS,
        ...overrides,
        thresholds: { ...SETTINGS.thresholds, ...(overrides.thresholds || {}) },
        capacity: { ...SETTINGS.capacity, ...(overrides.capacity || {}) },
        alerts: { ...SETTINGS.alerts, ...(overrides.alerts || {}) },
    };
}

const task = (overrides = {}) => ({
    uid: 'task-a',
    name: 'Tâche fictive',
    note: null,
    status: 'not_started',
    due_date: null,
    estimated_minutes: null,
    priority: 0,
    parent_uid: null,
    project_name: null,
    tags: [],
    recurring: false,
    series_uid: null,
    planned_on: [],
    blocks_uids: [],
    blocked_by_uids: [],
    money: false,
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
    inboxItems: [],
    events: [],
    focusBlocksByDate: {},
    postponements: {},
    contexts: [],
    decisions: [],
    replies: null,
    sources: [],
    ...overrides,
});

module.exports = { TODAY, SETTINGS, settingsWith, task, event, input };

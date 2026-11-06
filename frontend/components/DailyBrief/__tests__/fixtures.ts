import {
    BriefSettings,
    BriefTaskState,
    DailyBrief,
    DailyBriefResponse,
    DailyEvening,
    DailyEveningResponse,
} from '../../../utils/dailyBriefService';

export const TODAY = '2026-11-04';

export const SETTINGS: BriefSettings = {
    enabled: true,
    time: '07:00',
    days: [1, 2, 3, 4, 5],
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
    evening: { enabled: true, switchTime: '18:00' },
    timelineDays: 3,
    calendarFeedUids: [],
    calendarLookaheadDays: 7,
    priorities: ['consequence', 'blocking', 'money_deadline', 'planned_load'],
    thresholds: {
        postponements: 3,
        duplicateSimilarity: 0.8,
        maxMoves: 3,
        maxTonight: 3,
        closedLookbackDays: 7,
    },
    capacity: {
        evening: { '3': { start: '18:00', end: '22:00', minutes: 90 } },
        dayNotes: {},
    },
    retention: { decisionsDays: 90, audioDays: 7 },
    alerts: { disabled: [], noise: { minVotes: 3, ratio: 0.7 } },
    writing: { tone: 'neutral', signature: '', instructions: '' },
    llm: { enabled: false },
    voice: {
        enabled: false,
        piperUrl: '',
        voice: '',
        speed: 1,
        dictionary: [],
    },
    mail: {
        enabled: false,
        accounts: [],
        excludedAccounts: [],
        replyWindowDays: 14,
    },
    options: {
        eveningWrapUp: false,
        telegram: false,
        sonos: false,
        weekly: false,
    },
};

export const TASKS: Record<string, BriefTaskState> = {
    t1: {
        uid: 't1',
        name: 'Envoyer la déclaration',
        status: 'not_started',
        due_date: TODAY,
        completed_at: null,
        estimated_minutes: 40,
        priority: 2,
        project_name: 'Administratif',
    },
    t2: {
        uid: 't2',
        name: 'Trier les photos',
        status: 'not_started',
        due_date: TODAY,
        completed_at: null,
        estimated_minutes: null,
        priority: null,
        project_name: null,
    },
};

export const BRIEF: DailyBrief = {
    schema: 1,
    date: TODAY,
    timezone: 'Europe/Paris',
    generated_at: '2026-11-04T06:00:00.000Z',
    sources: [
        { id: 'tasks', status: 'read' },
        { id: 'calendar', status: 'read' },
        { id: 'mail', status: 'not_configured' },
        { id: 'llm', status: 'off' },
    ],
    counters: {
        due_today: 2,
        overdue: 1,
        tonight_minutes: 40,
        capacity_minutes: 90,
        conflicts: 1,
        replies: 0,
    },
    verdict: { text: 'Ce soir, une seule chose compte.', by: 'rules' },
    timeline: [
        {
            date: TODAY,
            work: [{ start: 480, end: 1020, label: 'Travail' }],
            events: [
                {
                    ref: 'event:f:e1:2026-11-04T13:00',
                    series_ref: null,
                    title: 'Dentiste',
                    all_day: false,
                    start_minute: 780,
                    end_minute: 840,
                    calendar: 'Perso',
                    conflict: true,
                },
            ],
            task_uids: ['t1'],
            load: {
                planned_minutes: 40,
                capacity_minutes: 90,
                hypothesis: true,
            },
            flags: [],
        },
    ],
    tonight: [{ task_uid: 't1', reason: 'échéance demain', minutes: 40 }],
    moves: [
        {
            proposal_key: 'move:t2:2026-11-07',
            task_uid: 't2',
            from: TODAY,
            to: '2026-11-07',
            reason: 'Reportée 3 fois',
        },
    ],
    anticipate: [
        {
            key: 'q:garage',
            type: 'event_in_work_hours',
            text: 'Garage jeudi 8:30',
            task_uids: [],
            event_refs: ['event:f:e2:2026-11-05T08:30'],
            question: {
                key: 'garage-same-car',
                text: 'Garage jeudi 8:30 : même voiture que la révision ?',
                target: { scope: 'event', ref: 'event:f:e2:2026-11-05T08:30' },
            },
        },
    ],
    replies: [],
    inbox: [],
    resolved: [],
    audio: {
        status: 'none',
        path: null,
        duration_seconds: null,
        chapters: [],
        voice: null,
    },
};

export const RESPONSE: DailyBriefResponse = {
    date: TODAY,
    brief: BRIEF,
    version: 1,
    status: 'ready',
    generated_at: BRIEF.generated_at,
    tasks: TASKS,
};

// Mock of react-i18next: returns the fallback with its placeholders filled.
export const i18nMock = () => {
    const t = (
        key: string,
        fallback?: unknown,
        options?: Record<string, unknown>
    ) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
            String(options?.[name] ?? '')
        );
    };
    return { useTranslation: () => ({ t, i18n: { language: 'fr' } }) };
};

export const DONE_TASK: BriefTaskState = {
    uid: 't3',
    name: 'Écrire le compte rendu',
    status: 'done',
    due_date: TODAY,
    completed_at: '2026-11-04T16:00:00.000Z',
    estimated_minutes: 20,
    priority: null,
    project_name: null,
};

export const EVENING: DailyEvening = {
    schema: 1,
    date: TODAY,
    generated_at: '2026-11-04T17:00:00.000Z',
    verdict: {
        text: '1 tâche terminée aujourd’hui, 1 glisse vers demain.',
        by: 'rules',
    },
    counters: {
        done: 1,
        slipped: 1,
        tonight_minutes: 40,
        capacity_minutes: 90,
    },
    done: ['t3'],
    tonight: [{ task_uid: 't1', minutes: 40 }],
    slipped: [
        {
            task_uid: 't2',
            reason: 'Due aujourd’hui, pas dans la liste de ce soir',
        },
    ],
    carry_over: ['t2', 't1'],
    tomorrow: {
        date: '2026-11-05',
        work: [],
        events: [],
        task_uids: [],
        load: {
            planned_minutes: 0,
            capacity_minutes: null,
            hypothesis: true,
        },
        flags: [],
    },
};

export const EVENING_RESPONSE: DailyEveningResponse = {
    date: TODAY,
    evening: EVENING,
    tasks: { t1: TASKS.t1, t2: TASKS.t2, t3: DONE_TASK },
};

'use strict';

const { buildBrief } = require('../../../../modules/daily-plan/brief/build');
const { TODAY, settingsWith, task, event, input } = require('./fixtures');

const TOP_KEYS = [
    'anticipate',
    'audio',
    'audio_script',
    'counters',
    'date',
    'generated_at',
    'inbox',
    'moves',
    'replies',
    'resolved',
    'schema',
    'sections',
    'sources',
    'timeline',
    'timezone',
    'tonight',
    'verdict',
];

const closed = (n, day) => ({
    uid: `closed-${n}`,
    name: `Terminée fictive ${n}`,
    note: null,
    completed_at: `${day}T09:00:00Z`,
    parent_uid: null,
});

describe('buildBrief', () => {
    it('has every key of the schema 1 brief, with the audio placeholders', () => {
        const brief = buildBrief(
            input({ tasks: [task({ due_date: TODAY })] }),
            settingsWith()
        );
        expect(Object.keys(brief).sort()).toEqual(TOP_KEYS.sort());
        expect(brief).toMatchObject({
            schema: 1,
            date: TODAY,
            timezone: 'Europe/Paris',
            generated_at: '2026-11-04T06:00:00Z',
            audio_script: { chapters: [] },
            audio: {
                status: 'none',
                path: null,
                duration_seconds: null,
                chapters: [],
                voice: null,
            },
            verdict: { by: 'rules' },
        });
        expect(brief.counters).toMatchObject({
            due_today: 1,
            overdue: 0,
            replies: 0,
        });
    });

    it('builds one timeline day per timelineDays, today first', () => {
        const brief = buildBrief(input(), settingsWith({ timelineDays: 2 }));
        expect(brief.timeline.map((day) => day.date)).toEqual([
            TODAY,
            '2026-11-05',
        ]);
        expect(brief.timeline[0]).toMatchObject({
            work: [],
            events: [],
            task_uids: [],
            flags: [],
        });
    });

    it('keeps the section order from settings', () => {
        const brief = buildBrief(
            input(),
            settingsWith({ sections: ['tonight', 'verdict'] })
        );
        expect(brief.sections).toEqual(['tonight', 'verdict']);
    });

    it('marks overloaded days and their overload card', () => {
        const brief = buildBrief(
            input({
                tasks: [
                    task({
                        uid: 'big',
                        due_date: TODAY,
                        estimated_minutes: 200,
                    }),
                ],
            }),
            settingsWith({
                capacity: {
                    evening: {
                        3: { start: '18:00', end: '22:00', minutes: 60 },
                    },
                },
            })
        );
        expect(brief.timeline[0].flags).toEqual(['overloaded']);
        expect(brief.anticipate.map((c) => c.type)).toContain('overload');
    });

    it('drops the card types switched off in alerts.disabled', () => {
        const data = input({
            tasks: [
                task({ uid: 'big', due_date: TODAY, estimated_minutes: 200 }),
            ],
        });
        const settings = settingsWith({
            capacity: {
                evening: { 3: { start: '18:00', end: '22:00', minutes: 60 } },
            },
            alerts: { disabled: ['overload'] },
        });
        expect(
            buildBrief(data, settings).anticipate.map((c) => c.type)
        ).not.toContain('overload');
    });

    it('drops a question whose target has a context', () => {
        const events = [
            event({
                ref: 'event:a',
                series_ref: 'series:feed-a:weekly',
                start_minute: 990,
                end_minute: 1050,
            }),
        ];
        const focusBlocksByDate = {
            [TODAY]: [{ start: 540, end: 1020, label: 'Focus' }],
        };
        const withoutContext = buildBrief(
            input({ events, focusBlocksByDate }),
            settingsWith()
        );
        expect(withoutContext.anticipate.map((c) => c.type)).toContain(
            'event_in_work_hours'
        );

        const silenced = buildBrief(
            input({
                events,
                focusBlocksByDate,
                contexts: [
                    {
                        scope: 'series',
                        target_ref: 'series:feed-a:weekly',
                        text: 'Salle partagée',
                    },
                ],
            }),
            settingsWith()
        );
        expect(silenced.anticipate.map((c) => c.type)).not.toContain(
            'event_in_work_hours'
        );
    });

    it('flags conflicting events on the timeline and counts them', () => {
        const events = [
            event({ ref: 'event:a', start_minute: 600, end_minute: 660 }),
            event({ ref: 'event:b', start_minute: 630, end_minute: 690 }),
        ];
        const brief = buildBrief(input({ events }), settingsWith());
        expect(brief.counters.conflicts).toBe(1);
        expect(brief.timeline[0].events.every((e) => e.conflict)).toBe(true);
        expect(brief.anticipate[0]).toMatchObject({
            type: 'conflict',
            event_refs: ['event:a', 'event:b'],
        });
    });

    it('lists the 10 newest closed tasks of the lookback', () => {
        const closedTasks = [
            ...Array.from({ length: 12 }, (_, i) =>
                closed(i, `2026-11-0${1 + (i % 3)}`)
            ),
            closed('old', '2026-09-01'),
        ];
        const { resolved } = buildBrief(input({ closedTasks }), settingsWith());
        expect(resolved).toHaveLength(10);
        const dates = resolved.map((r) => r.completed_at);
        expect([...dates].sort().reverse()).toEqual(dates);
        expect(resolved.map((r) => r.task_uid)).not.toContain('closed-old');
    });

    it('keeps the 5 oldest inbox items with no proposal yet', () => {
        const inboxItems = Array.from({ length: 7 }, (_, i) => ({
            uid: `inbox-${i}`,
            title: `Idée fictive ${i}`,
            created_at: `2026-11-0${i + 1}T08:00:00Z`,
        }));
        const { inbox } = buildBrief(input({ inboxItems }), settingsWith());
        expect(inbox.map((i) => i.uid)).toEqual([
            'inbox-0',
            'inbox-1',
            'inbox-2',
            'inbox-3',
            'inbox-4',
        ]);
        expect(inbox[0].proposal).toBeNull();
    });

    it('reports replies when the mail source was read, none when it was not', () => {
        const reply = {
            account: 'compte-fictif',
            thread_ref: 'thread-1',
            from: 'Personne Fictive',
            subject: 'Sujet fictif',
            date: '2026-11-03T10:00:00Z',
            summary: 'Résumé fictif',
            link: 'https://mail.example.test/thread-1',
        };
        const read = buildBrief(input({ replies: [reply] }), settingsWith());
        expect(read.replies).toEqual([reply]);
        expect(read.counters.replies).toBe(1);

        const unread = buildBrief(input({ replies: null }), settingsWith());
        expect(unread.replies).toEqual([]);
        expect(unread.counters.replies).toBe(0);
    });
});

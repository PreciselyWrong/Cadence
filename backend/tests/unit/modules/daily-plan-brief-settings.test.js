const {
    DEFAULTS,
    normalizeBriefSettings,
    validateBriefSettingsUpdate,
    mergeBriefSettings,
} = require('../../../modules/daily-plan/brief/settings');
const { ValidationError } = require('../../../shared/errors');

describe('normalizeBriefSettings', () => {
    it('returns the documented defaults for nothing saved', () => {
        expect(normalizeBriefSettings(undefined)).toEqual(DEFAULTS);
        expect(normalizeBriefSettings(null)).toEqual(DEFAULTS);
        expect(normalizeBriefSettings('garbage')).toEqual(DEFAULTS);
        expect(normalizeBriefSettings([1, 2])).toEqual(DEFAULTS);
    });

    it('matches the Settings table of docs/39-daily-brief.md', () => {
        expect(DEFAULTS).toMatchObject({
            enabled: false,
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
            ],
            thresholds: {
                postponements: 3,
                duplicateSimilarity: 0.8,
                maxMoves: 3,
                maxTonight: 3,
                closedLookbackDays: 7,
            },
            capacity: { evening: {}, dayNotes: {} },
            retention: { decisionsDays: 90, audioDays: 7 },
            alerts: { disabled: [], noise: { minVotes: 3, ratio: 0.7 } },
            writing: { tone: 'neutral', instructions: '' },
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
        });
    });

    it('falls back to the default for each invalid key', () => {
        const result = normalizeBriefSettings({
            enabled: 'yes',
            time: '25:00',
            timelineDays: 'three',
            sections: 'verdict',
            priorities: [],
        });

        expect(result.enabled).toBe(false);
        expect(result.time).toBe('07:00');
        expect(result.timelineDays).toBe(3);
        expect(result.sections).toEqual(DEFAULTS.sections);
        expect(result.priorities).toEqual(DEFAULTS.priorities);
    });

    it('clamps numbers to their ranges', () => {
        const result = normalizeBriefSettings({
            timelineDays: 99,
            calendarLookaheadDays: 0,
            voice: { speed: 9 },
            thresholds: { postponements: -4, duplicateSimilarity: 2 },
            retention: { decisionsDays: 10000 },
        });

        expect(result.timelineDays).toBe(7);
        expect(result.calendarLookaheadDays).toBe(1);
        expect(result.voice.speed).toBe(2);
        expect(result.thresholds.postponements).toBe(1);
        expect(result.thresholds.duplicateSimilarity).toBe(1);
        expect(result.retention.decisionsDays).toBe(365);
    });

    it('rejects a time that is not HH:mm on a 5-minute step', () => {
        expect(normalizeBriefSettings({ time: '7:00' }).time).toBe('07:00');
        expect(normalizeBriefSettings({ time: '07:03' }).time).toBe('07:00');
        expect(normalizeBriefSettings({ time: '24:00' }).time).toBe('07:00');
        expect(normalizeBriefSettings({ time: '06:55' }).time).toBe('06:55');
    });

    it('keeps only known sections, in order, without duplicates', () => {
        const result = normalizeBriefSettings({
            sections: ['tonight', 'nope', 'verdict', 'tonight', 'inbox'],
        });

        expect(result.sections).toEqual(['tonight', 'verdict', 'inbox']);
    });

    it('keeps an empty section list: the user hid every section', () => {
        expect(normalizeBriefSettings({ sections: [] }).sections).toEqual([]);
    });

    it('filters days to unique integers 0 to 6, sorted', () => {
        expect(
            normalizeBriefSettings({ days: [6, 6, 0, 9, -1, 2.5, '3'] }).days
        ).toEqual([0, 6]);
    });

    it('caps and filters calendar feed uids', () => {
        const many = Array.from({ length: 60 }, (_, i) => `feed-${i}`);
        const result = normalizeBriefSettings({
            calendarFeedUids: [...many, 'x'.repeat(101), '', 42],
        });

        expect(result.calendarFeedUids).toHaveLength(50);
        expect(result.calendarFeedUids[0]).toBe('feed-0');
    });

    it('trims and length-caps strings', () => {
        const result = normalizeBriefSettings({
            writing: {
                tone: `  ${'t'.repeat(60)}  `,
                instructions: 'i'.repeat(2500),
            },
        });

        expect(result.writing.tone).toHaveLength(40);
        expect(result.writing.instructions).toHaveLength(2000);
    });

    it('defaults the evening review to on, at 18:00', () => {
        expect(DEFAULTS.evening).toEqual({
            enabled: true,
            switchTime: '18:00',
        });
    });

    it('keeps the evening switch time on a 5-minute step only', () => {
        expect(
            normalizeBriefSettings({ evening: { switchTime: '19:30' } }).evening
                .switchTime
        ).toBe('19:30');
        expect(
            normalizeBriefSettings({ evening: { switchTime: '19:03' } }).evening
                .switchTime
        ).toBe('18:00');
        expect(
            normalizeBriefSettings({ evening: { switchTime: '7:00pm' } })
                .evening.switchTime
        ).toBe('18:00');
        expect(
            normalizeBriefSettings({ evening: { enabled: 'no' } }).evening
                .enabled
        ).toBe(true);
    });

    it('validates the evening review on update', () => {
        expect(() =>
            validateBriefSettingsUpdate({
                evening: { enabled: false, switchTime: '20:15' },
            })
        ).not.toThrow();
        expect(() =>
            validateBriefSettingsUpdate({ evening: { switchTime: '20:17' } })
        ).toThrow(ValidationError);
        expect(() =>
            validateBriefSettingsUpdate({ evening: { enabled: 'yes' } })
        ).toThrow(ValidationError);
    });

    it('keeps evening windows only when valid', () => {
        const result = normalizeBriefSettings({
            capacity: {
                evening: {
                    1: { start: '18:00', end: '20:00', minutes: 120 },
                    2: { start: '20:00', end: '18:00', minutes: 60 },
                    3: { start: '18:00', end: '20:00' },
                    7: { start: '18:00', end: '20:00', minutes: 60 },
                    4: { start: '18:01', end: '20:00', minutes: 60 },
                    5: { start: '18:00', end: '20:00', minutes: 9999 },
                },
            },
        });

        expect(Object.keys(result.capacity.evening).sort()).toEqual(['1', '5']);
        expect(result.capacity.evening['5'].minutes).toBe(600);
    });

    it('drops day notes that are empty after trimming', () => {
        const result = normalizeBriefSettings({
            capacity: { dayNotes: { 1: '  remote  ', 2: '   ' } },
        });

        expect(result.capacity.dayNotes).toEqual({ 1: 'remote' });
    });

    it('only accepts an http(s) URL for the Piper server', () => {
        expect(
            normalizeBriefSettings({
                voice: { piperUrl: 'http://piper.lan:5000' },
            }).voice.piperUrl
        ).toBe('http://piper.lan:5000');
        expect(
            normalizeBriefSettings({
                voice: { piperUrl: 'javascript:alert(1)' },
            }).voice.piperUrl
        ).toBe('');
        expect(
            normalizeBriefSettings({
                voice: { piperUrl: `https://a.b/${'x'.repeat(300)}` },
            }).voice.piperUrl
        ).toBe('');
    });

    it('keeps alert types that exist and drops the others', () => {
        expect(
            normalizeBriefSettings({
                alerts: { disabled: ['overload', 'made_up'] },
            }).alerts.disabled
        ).toEqual(['overload']);
    });

    it('drops dictionary entries without both sides', () => {
        expect(
            normalizeBriefSettings({
                voice: {
                    dictionary: [
                        { from: 'Cadence', to: 'Kéïdence' },
                        { from: '', to: 'x' },
                        { from: 'y' },
                    ],
                },
            }).voice.dictionary
        ).toEqual([{ from: 'Cadence', to: 'Kéïdence' }]);
    });
});

describe('validateBriefSettingsUpdate', () => {
    // The Android app before 1.19 can still send them; they are dropped, not refused.
    it('drops the retired options and signature from an update', () => {
        const patch = validateBriefSettingsUpdate({
            writing: { tone: 'warm', signature: 'N.' },
            options: { sonos: true },
        });

        expect(patch).toEqual({ writing: { tone: 'warm' } });
    });

    it('leaves the retired settings out of the stored ones', () => {
        const result = normalizeBriefSettings({
            writing: { signature: 'N.' },
            options: { weekly: true },
        });

        expect(result.options).toBeUndefined();
        expect(result.writing.signature).toBeUndefined();
    });

    it('accepts a valid partial update', () => {
        expect(() =>
            validateBriefSettingsUpdate({
                enabled: true,
                time: '06:30',
                thresholds: { postponements: 5 },
                capacity: {
                    evening: {
                        1: { start: '18:00', end: '20:00', minutes: 90 },
                    },
                    dayNotes: { 1: null },
                },
            })
        ).not.toThrow();
    });

    it.each([
        ['a string for a boolean', { enabled: 'true' }],
        ['a number for the time', { time: 700 }],
        ['an unknown time', { time: '7:00' }],
        ['a string for a number', { thresholds: { postponements: '3' } }],
        ['an unknown section', { sections: ['verdict', 'weather'] }],
        ['a non-list for days', { days: 1 }],
        ['a day out of range', { days: [7] }],
        ['an unknown key', { nope: 1 }],
        ['an unknown nested key', { thresholds: { nope: 1 } }],
        [
            'an invalid evening window',
            {
                capacity: {
                    evening: {
                        1: { start: '20:00', end: '18:00', minutes: 60 },
                    },
                },
            },
        ],
        ['a non-weekday evening key', { capacity: { evening: { 9: null } } }],
        ['a non-object update', ['enabled']],
        ['a null object', null],
    ])('throws ValidationError for %s', (_label, patch) => {
        expect(() => validateBriefSettingsUpdate(patch)).toThrow(
            ValidationError
        );
    });
});

describe('mergeBriefSettings', () => {
    it('deep-merges objects and keeps the other keys', () => {
        const current = normalizeBriefSettings({
            enabled: true,
            thresholds: { postponements: 3, maxMoves: 2 },
        });

        const merged = normalizeBriefSettings(
            mergeBriefSettings(current, { thresholds: { postponements: 5 } })
        );

        expect(merged.enabled).toBe(true);
        expect(merged.thresholds).toEqual({
            postponements: 5,
            duplicateSimilarity: 0.8,
            maxMoves: 2,
            maxTonight: 3,
            closedLookbackDays: 7,
        });
    });

    it('replaces arrays instead of merging them', () => {
        const merged = normalizeBriefSettings(
            mergeBriefSettings(
                normalizeBriefSettings({ sections: ['verdict', 'tonight'] }),
                { sections: ['inbox'] }
            )
        );

        expect(merged.sections).toEqual(['inbox']);
    });

    it('removes a weekday when its evening window is null', () => {
        const current = normalizeBriefSettings({
            capacity: {
                evening: {
                    1: { start: '18:00', end: '20:00', minutes: 120 },
                    2: { start: '18:00', end: '19:00', minutes: 60 },
                },
            },
        });

        const merged = normalizeBriefSettings(
            mergeBriefSettings(current, {
                capacity: { evening: { 1: null } },
            })
        );

        expect(Object.keys(merged.capacity.evening)).toEqual(['2']);
    });

    it('does not mutate the current settings', () => {
        const current = normalizeBriefSettings({});
        mergeBriefSettings(current, { thresholds: { maxMoves: 9 } });

        expect(current.thresholds.maxMoves).toBe(3);
    });
});

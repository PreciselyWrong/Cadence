'use strict';

const {
    DEFAULTS,
    normalizeTriageSettings,
    triageSettingsFromUiSettings,
    validateTriageSettingsUpdate,
} = require('../../../modules/triage/settings');
const { ValidationError } = require('../../../shared/errors');

describe('triage settings', () => {
    it('gives the defaults for nothing saved', () => {
        expect(normalizeTriageSettings(undefined)).toEqual(DEFAULTS);
        expect(normalizeTriageSettings('garbage')).toEqual(DEFAULTS);
        expect(DEFAULTS).toEqual({
            calendarFeedUids: [],
            calendarLookaheadDays: 7,
            thresholds: {
                postponements: 3,
                duplicateSimilarity: 0.8,
                closedLookbackDays: 7,
            },
            alerts: { disabled: [] },
            triage: { enabled: false, dailyLimit: 20 },
        });
    });

    it('reads the values the daily brief saved, and ignores its other keys', () => {
        const settings = triageSettingsFromUiSettings(
            JSON.stringify({
                brief: {
                    enabled: true,
                    calendarFeedUids: ['feed-a', 'feed-a', ' ', 'feed-b'],
                    thresholds: { postponements: 99, maxMoves: 2 },
                    alerts: { disabled: ['overload', 'duplicate'] },
                    triage: { enabled: true, dailyLimit: 5 },
                },
            })
        );
        expect(settings).toEqual({
            ...DEFAULTS,
            calendarFeedUids: ['feed-a', 'feed-b'],
            thresholds: { ...DEFAULTS.thresholds, postponements: 20 },
            alerts: { disabled: ['duplicate'] },
            triage: { enabled: true, dailyLimit: 5 },
        });
    });

    it('falls back on unreadable ui_settings', () => {
        expect(triageSettingsFromUiSettings('{')).toEqual(DEFAULTS);
        expect(triageSettingsFromUiSettings(null)).toEqual(DEFAULTS);
    });

    it('accepts a partial update and rejects unknown or invalid keys', () => {
        expect(() =>
            validateTriageSettingsUpdate({ triage: { dailyLimit: 10 } })
        ).not.toThrow();
        expect(() => validateTriageSettingsUpdate({ time: '07:00' })).toThrow(
            ValidationError
        );
        expect(() =>
            validateTriageSettingsUpdate({ triage: { enabled: 'yes' } })
        ).toThrow(ValidationError);
        expect(() => validateTriageSettingsUpdate([])).toThrow(ValidationError);
    });
});

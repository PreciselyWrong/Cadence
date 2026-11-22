import fs from 'fs';
import path from 'path';
import {
    defaultDays,
    dominantWeather,
    latestWeekends,
    pickerDays,
    shareDays,
    toggleDay,
} from '../weekendModel';
import type {
    WeekendAnswer,
    WeekendOp,
    WeekendProposal,
} from '../../../utils/proposalsService';

// Android replays the same cases (WeekendModelTest).
const fixture = JSON.parse(
    fs.readFileSync(
        path.join(
            __dirname,
            '../../../../fixtures/weekend/request-and-share.json'
        ),
        'utf8'
    )
);

describe('week-end on demand, shared cases', () => {
    it.each(fixture.defaultDays)(
        'defaultDays($today)',
        ({ today, expect: e }) => {
            expect(defaultDays(today)).toEqual(e);
        }
    );

    it.each(fixture.toggle)(
        'toggleDay($selected, $date)',
        ({ selected, date, expect: e }) => {
            expect(toggleDay(selected, date)).toEqual(e);
        }
    );

    it.each(fixture.pickerDays)(
        'pickerDays($today)',
        ({ today, expect: e }) => {
            expect(pickerDays(today)).toEqual(e);
        }
    );

    it.each(fixture.share)(
        'shareDays: $name',
        ({ answer, picks, expect: e }) => {
            const map = new Map(Object.entries(picks) as [string, WeekendOp][]);
            expect(shareDays(answer as WeekendAnswer, map)).toEqual(e);
        }
    );

    it.each(fixture.dominant)('dominantWeather $#', ({ days, expect: e }) => {
        expect(dominantWeather(days)).toBe(e);
    });
});

describe('latestWeekends', () => {
    const row = (fields: Partial<WeekendProposal>): WeekendProposal => ({
        uid: 'u',
        kind: 'weekend',
        status: 'ready',
        created_at: '2026-11-22T10:00:00Z',
        answer: null,
        ...fields,
    });
    const answer = { headline: 'Week-end', days: [], slots: [] };

    it('keeps the pending request and the last weekend shown', () => {
        const pending = row({ uid: 'p', status: 'pending' });
        const shown = row({ uid: 's', answer });
        expect(latestWeekends([pending, shown])).toEqual({
            request: pending,
            shown,
        });
    });

    it('has no request when the latest weekend is ready', () => {
        const shown = row({ uid: 's', answer });
        expect(latestWeekends([shown])).toEqual({ request: null, shown });
    });

    it('keeps a failed request without answer, and nothing else', () => {
        const failed = row({ uid: 'f', status: 'failed', error: 'timeout' });
        expect(latestWeekends([failed])).toEqual({
            request: failed,
            shown: null,
        });
    });
});

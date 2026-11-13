'use strict';

const {
    workHourConflicts,
    overlappingEvents,
    conflictCards,
} = require('../../../../modules/triage/core/rules/conflicts');
const { TODAY, event, input } = require('./fixtures');

const WORK = { [TODAY]: [{ start: 540, end: 1020, label: 'Focus' }] };

describe('workHourConflicts', () => {
    it('finds a busy timed event overlapping a focus block', () => {
        const events = [event({ start_minute: 990, end_minute: 1050 })];
        const found = workHourConflicts(
            input({ events, focusBlocksByDate: WORK })
        );
        expect(found).toHaveLength(1);
        expect(found[0].event.start_minute).toBe(990);
    });

    it('does not count an event that only touches the block end', () => {
        const events = [event({ start_minute: 1020, end_minute: 1080 })];
        expect(
            workHourConflicts(input({ events, focusBlocksByDate: WORK }))
        ).toHaveLength(0);
    });

    it('ignores non-busy events', () => {
        const events = [
            event({ busy: false, start_minute: 600, end_minute: 660 }),
        ];
        expect(
            workHourConflicts(input({ events, focusBlocksByDate: WORK }))
        ).toHaveLength(0);
    });
});

describe('overlappingEvents', () => {
    it('pairs two overlapping busy timed events once', () => {
        const events = [
            event({ ref: 'event:a', start_minute: 600, end_minute: 660 }),
            event({ ref: 'event:b', start_minute: 630, end_minute: 690 }),
            event({ ref: 'event:c', start_minute: 690, end_minute: 720 }),
        ];
        const pairs = overlappingEvents(input({ events }));
        expect(pairs).toHaveLength(1);
        expect([pairs[0].a.ref, pairs[0].b.ref]).toEqual([
            'event:a',
            'event:b',
        ]);
    });

    it('does not pair events of different days', () => {
        const events = [
            event({ ref: 'event:a', start_minute: 600, end_minute: 660 }),
            event({
                ref: 'event:b',
                date: '2026-11-05',
                start_minute: 600,
                end_minute: 660,
            }),
        ];
        expect(overlappingEvents(input({ events }))).toHaveLength(0);
    });
});

describe('conflictCards', () => {
    it('makes a question targeting the series when the event recurs', () => {
        const events = [
            event({
                ref: 'event:a',
                series_ref: 'series:feed-a:weekly',
                start_minute: 600,
                end_minute: 660,
            }),
            event({ ref: 'event:b', start_minute: 630, end_minute: 690 }),
        ];
        const [card] = conflictCards(input({ events }));
        expect(card.type).toBe('conflict');
        expect(card.event_refs).toEqual(['event:a', 'event:b']);
        expect(card.question.target).toEqual({
            scope: 'series',
            ref: 'series:feed-a:weekly',
        });
    });

    it('makes an event_in_work_hours card with an event target', () => {
        const events = [
            event({ ref: 'event:a', start_minute: 990, end_minute: 1050 }),
        ];
        const [card] = conflictCards(
            input({ events, focusBlocksByDate: WORK })
        );
        expect(card).toMatchObject({
            type: 'event_in_work_hours',
            event_refs: ['event:a'],
            question: { target: { scope: 'event', ref: 'event:a' } },
        });
    });
});

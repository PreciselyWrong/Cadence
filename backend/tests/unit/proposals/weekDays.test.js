'use strict';

const { weekDays } = require('../../../modules/proposals/core/weekDays');

const DAY = '2026-11-17';
const NINE_TO_SIX = { start: 540, end: 1080 };
const timed = (start_minute, end_minute, extra = {}) => ({
    title: 'Réunion',
    all_day: false,
    busy: true,
    start_minute,
    end_minute,
    ...extra,
});

const dayWith = (fields = {}) =>
    weekDays([
        {
            date: DAY,
            items: [],
            events: [],
            focusBlocks: [],
            dayHours: NINE_TO_SIX,
            ...fields,
        },
    ])[0];

describe('weekDays', () => {
    it('keeps one entry per input day, in order, with its date', () => {
        const days = weekDays([
            {
                date: '2026-11-17',
                items: [],
                events: [],
                focusBlocks: [],
                dayHours: NINE_TO_SIX,
            },
            {
                date: '2026-11-18',
                items: [],
                events: [],
                focusBlocks: [],
                dayHours: NINE_TO_SIX,
            },
        ]);
        expect(days.map((day) => day.date)).toEqual([
            '2026-11-17',
            '2026-11-18',
        ]);
    });

    it('uses the day hours as work and the free hours as capacity', () => {
        const day = dayWith();
        expect(day.work).toEqual({ start: '09:00', end: '18:00', label: null });
        expect(day.capacity_minutes).toBe(540);
    });

    it('uses the focus block of the day instead of the day hours, with its label', () => {
        const day = dayWith({
            focusBlocks: [{ start: 540, end: 720, label: 'Dentsply' }],
        });
        expect(day.work).toEqual({
            start: '09:00',
            end: '12:00',
            label: 'Dentsply',
        });
        expect(day.capacity_minutes).toBe(180);
    });

    it('takes the timed busy events inside the work hours out of the capacity', () => {
        const day = dayWith({ events: [timed(810, 870)] });
        expect(day.capacity_minutes).toBe(480);
    });

    it('counts overlapping busy events once', () => {
        const day = dayWith({
            events: [timed(600, 660), timed(630, 720)],
        });
        expect(day.capacity_minutes).toBe(540 - 120);
    });

    it('ignores free events and events outside the work hours when computing capacity', () => {
        const day = dayWith({
            events: [timed(600, 660, { busy: false }), timed(60, 120)],
        });
        expect(day.capacity_minutes).toBe(540);
    });

    it('does not take all-day events out of the capacity', () => {
        const day = dayWith({
            events: [
                {
                    title: 'Congrès',
                    all_day: true,
                    busy: false,
                    start_minute: null,
                    end_minute: null,
                },
            ],
        });
        expect(day.capacity_minutes).toBe(540);
        expect(day.events).toEqual([
            { title: 'Congrès', start: null, end: null, all_day: true },
        ]);
    });

    it('formats timed events as HH:MM and keeps their title', () => {
        const day = dayWith({
            events: [timed(810, 870, { title: '  Foire aux livres ' })],
        });
        expect(day.events).toEqual([
            {
                title: 'Foire aux livres',
                start: '13:30',
                end: '14:30',
                all_day: false,
            },
        ]);
    });

    it('sums the planned tasks, a task without duration counting 60 minutes', () => {
        const day = dayWith({
            items: [
                { task_uid: 'a', name: 'Classer', duration_minutes: 30 },
                { task_uid: 'b', name: 'Relire', duration_minutes: null },
            ],
        });
        expect(day.items).toEqual([
            { task_uid: 'a', name: 'Classer', minutes: 30 },
            { task_uid: 'b', name: 'Relire', minutes: 60 },
        ]);
        expect(day.load_minutes).toBe(90);
    });

    it('gives an empty day with no load and the whole capacity', () => {
        const day = dayWith();
        expect(day.load_minutes).toBe(0);
        expect(day.items).toEqual([]);
        expect(day.events).toEqual([]);
    });

    it('gives no work and no capacity when the day has no hours and no focus block', () => {
        const day = dayWith({ dayHours: null });
        expect(day.work).toBeNull();
        expect(day.capacity_minutes).toBe(0);
    });
});

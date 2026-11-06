'use strict';

const {
    taskMinutes,
    dayLoad,
    fits,
    eveningCapacity,
    overloadCards,
} = require('../../../../modules/daily-plan/brief/rules/load');
const { TODAY, settingsWith, task, event, input } = require('./fixtures');

// Wednesday evening, 18:00 to 22:00, 120 minutes configured.
const EVENING = {
    capacity: {
        evening: { 3: { start: '18:00', end: '22:00', minutes: 120 } },
    },
};

describe('taskMinutes', () => {
    it('uses the estimate when there is one', () => {
        expect(taskMinutes(task({ estimated_minutes: 45 }))).toEqual({
            minutes: 45,
            estimated: false,
        });
    });

    it('falls back to 30 minutes, marked as estimated', () => {
        expect(taskMinutes(task({ estimated_minutes: null }))).toEqual({
            minutes: 30,
            estimated: true,
        });
    });
});

describe('dayLoad without capacity', () => {
    it('counts a task and its subtask due the same day once', () => {
        const tasks = [
            task({ uid: 'p', due_date: TODAY, estimated_minutes: 60 }),
            task({
                uid: 'c',
                parent_uid: 'p',
                due_date: TODAY,
                estimated_minutes: 20,
            }),
            task({
                uid: 'alone',
                parent_uid: 'elsewhere',
                due_date: TODAY,
                estimated_minutes: 15,
            }),
        ];
        const load = dayLoad(input({ tasks }), settingsWith(), TODAY);
        expect(load.taskMinutes ?? load.task_minutes).toBe(75);
    });

    it('adds tasks due or planned that day and timed busy events', () => {
        const tasks = [
            task({ uid: 'a', due_date: TODAY, estimated_minutes: 45 }),
            task({ uid: 'b', planned_on: [TODAY] }),
        ];
        const events = [event({ start_minute: 600, end_minute: 660 })];
        const load = dayLoad(input({ tasks, events }), settingsWith(), TODAY);
        expect(load.task_minutes).toBe(75);
        expect(load.event_minutes).toBe(60);
        expect(load.planned_minutes).toBe(135);
        expect(load.capacity_minutes).toBeNull();
        expect(load.overloaded).toBe(false);
        expect(load.hypothesis).toBe(true);
    });

    it('counts a task due and planned on the same day once', () => {
        const tasks = [
            task({
                uid: 'a',
                due_date: TODAY,
                planned_on: [TODAY],
                estimated_minutes: 20,
            }),
        ];
        const load = dayLoad(input({ tasks }), settingsWith(), TODAY);
        expect(load.planned_minutes).toBe(20);
    });

    it('ignores all-day and non-busy events', () => {
        const events = [
            event({ all_day: true, start_minute: null, end_minute: null }),
            event({ busy: false }),
        ];
        const load = dayLoad(input({ events }), settingsWith(), TODAY);
        expect(load.planned_minutes).toBe(0);
    });

    it('is never overloaded without a configured capacity', () => {
        const tasks = [task({ due_date: TODAY, estimated_minutes: 900 })];
        const load = dayLoad(input({ tasks }), settingsWith(), TODAY);
        expect(load.overloaded).toBe(false);
        expect(fits(load, 600)).toBe(true);
    });
});

describe('dayLoad with evening capacity', () => {
    it('uses the configured minutes when nothing covers the window', () => {
        const load = dayLoad(input(), settingsWith(EVENING), TODAY);
        expect(load.capacity_minutes).toBe(120);
    });

    it('is overloaded when planned minutes exceed the capacity', () => {
        const tasks = [
            task({ uid: 'a', due_date: TODAY, estimated_minutes: 50 }),
            task({ uid: 'b', due_date: TODAY, estimated_minutes: 50 }),
            task({ uid: 'c', due_date: TODAY, estimated_minutes: 50 }),
        ];
        const load = dayLoad(input({ tasks }), settingsWith(EVENING), TODAY);
        expect(load.planned_minutes).toBe(150);
        expect(load.overloaded).toBe(true);
        expect(fits(load, 10)).toBe(false);
    });

    it('compares only task minutes with the evening capacity', () => {
        // A long daytime meeting is not evening work, and an evening event is
        // already taken out of the capacity: neither may count twice.
        const tasks = [
            task({ uid: 'a', due_date: TODAY, estimated_minutes: 60 }),
        ];
        const events = [event({ start_minute: 540, end_minute: 720 })];
        const load = dayLoad(
            input({ tasks, events }),
            settingsWith(EVENING),
            TODAY
        );
        expect(load.overloaded).toBe(false);
        expect(fits(load, 60)).toBe(true);
    });

    it('removes a focus block and an event from the evening window', () => {
        const focusBlocksByDate = {
            [TODAY]: [{ start: 1080, end: 1110, label: 'Focus' }],
        };
        const events = [event({ start_minute: 1140, end_minute: 1170 })];
        const capacity = eveningCapacity(
            settingsWith(EVENING),
            focusBlocksByDate[TODAY],
            events,
            TODAY
        );
        // 30 minutes of focus block and 30 minutes of event in the window.
        expect(capacity).toBe(60);
    });

    it('counts an overlap of a focus block and an event once', () => {
        const focusBlocks = [{ start: 1080, end: 1110, label: 'Focus' }];
        const events = [event({ start_minute: 1095, end_minute: 1125 })];
        expect(
            eveningCapacity(settingsWith(EVENING), focusBlocks, events, TODAY)
        ).toBe(120 - 45);
    });

    it('never goes below zero', () => {
        const focusBlocks = [{ start: 1080, end: 1320, label: 'Focus' }];
        expect(
            eveningCapacity(settingsWith(EVENING), focusBlocks, [], TODAY)
        ).toBe(0);
    });

    it('is null when no window is configured for that weekday', () => {
        const otherDay = '2026-11-05';
        expect(
            eveningCapacity(settingsWith(EVENING), [], [], otherDay)
        ).toBeNull();
    });

    it('is null when the window is malformed', () => {
        const settings = settingsWith({
            capacity: {
                evening: { 3: { start: 'tard', end: '22:00', minutes: 60 } },
            },
        });
        expect(eveningCapacity(settings, [], [], TODAY)).toBeNull();
    });
});

describe('overloadCards', () => {
    it('makes one overload card per overloaded day', () => {
        const tasks = [
            task({ uid: 'a', due_date: TODAY, estimated_minutes: 200 }),
        ];
        const load = dayLoad(input({ tasks }), settingsWith(EVENING), TODAY);
        const cards = overloadCards([load]);
        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            key: `overload:${TODAY}`,
            type: 'overload',
            task_uids: ['a'],
            question: null,
        });
    });
});

describe('dayLoad with the free time of the day', () => {
    const dayHours = { start: 480, end: 1080 }; // 8:00 to 18:00

    it('counts the day hours minus focus blocks and timed busy events', () => {
        const load = dayLoad(
            input({
                dayHours,
                focusBlocksByDate: {
                    [TODAY]: [{ start: 540, end: 720, label: 'Travail' }],
                },
                events: [event({ start_minute: 780, end_minute: 840 })],
            }),
            settingsWith(),
            TODAY
        );
        expect(load.day_free_minutes).toBe(600 - 180 - 60);
        expect(load.evening_minutes).toBeNull();
        expect(load.capacity_minutes).toBe(360);
    });

    it('adds the evening capacity, and counts their overlap once', () => {
        const load = dayLoad(
            input({ dayHours: { start: 480, end: 1140 } }), // until 19:00
            settingsWith(EVENING),
            TODAY
        );
        // 8:00-18:00 by day; 18:00-22:00 belongs to the evening's 120 minutes.
        expect(load.day_free_minutes).toBe(600);
        expect(load.evening_minutes).toBe(120);
        expect(load.capacity_minutes).toBe(720);
    });

    it('is overloaded only when tasks exceed the day and the evening together', () => {
        const tasks = [task({ due_date: TODAY, estimated_minutes: 700 })];
        const fitting = dayLoad(
            input({ tasks, dayHours }),
            settingsWith(EVENING),
            TODAY
        );
        expect(fitting.overloaded).toBe(false);

        const longer = [task({ due_date: TODAY, estimated_minutes: 721 })];
        expect(
            dayLoad(
                input({ tasks: longer, dayHours }),
                settingsWith(EVENING),
                TODAY
            ).overloaded
        ).toBe(true);
    });
});

describe('overloadCards wording', () => {
    const load = (task_minutes, capacity_minutes) => ({
        date: TODAY,
        tasks: [],
        task_minutes,
        capacity_minutes,
        overloaded: true,
    });

    it('states the load and what to do about it, in hours', () => {
        const [card] = overloadCards([load(555, 90)]);
        expect(card.text).toBe(
            '4 novembre : 9 h 15 de tâches pour 1 h 30 de libre. À alléger d’environ 7 h 45.'
        );
    });

    it('says so when nothing is free', () => {
        const [card] = overloadCards([load(45, 0)]);
        expect(card.text).toBe(
            '4 novembre : 45 min de tâches et aucun temps libre.'
        );
    });

    it('carries the numbers the spoken script needs', () => {
        const [card] = overloadCards([load(555, 90)]);
        expect(card.overload).toEqual({
            date: TODAY,
            task_minutes: 555,
            capacity_minutes: 90,
        });
    });
});

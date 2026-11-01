import { habitsToEvents } from '../Calendar/habitEvents';
import { HABIT_COLOR } from '../Calendar/taskEvents';
import type { CadenceCalendar } from '../../utils/cadenceHabitsService';

const calendar = (habits: CadenceCalendar['habits']): CadenceCalendar => ({
    from: '2026-10-01',
    to: '2026-10-31',
    timezone: 'UTC',
    habits,
});

describe('habitsToEvents', () => {
    it('draws a due day as a whole-day chip that opens the habit', () => {
        const [event] = habitsToEvents(
            calendar([
                {
                    uid: 'h1',
                    name: 'Stretch',
                    icon_id: null,
                    color_argb: null,
                    group_uid: null,
                    days: [
                        {
                            date: '2026-10-05',
                            status: 'MISSED',
                            done: false,
                            time: null,
                        },
                    ],
                },
            ])
        );

        expect(event).toMatchObject({
            id: 'habit-h1-2026-10-05',
            title: 'Stretch',
            type: 'event',
            allDay: true,
            readOnly: true,
            habitUid: 'h1',
            color: HABIT_COLOR,
        });
        expect(event.start).toEqual(new Date(2026, 9, 5));
        expect(event.end).toEqual(new Date(2026, 9, 6));
    });

    it('marks a done day with a check and uses the habit colour', () => {
        const [event] = habitsToEvents(
            calendar([
                {
                    uid: 'h1',
                    name: 'Read',
                    icon_id: null,
                    color_argb: -16744448,
                    group_uid: null,
                    days: [
                        {
                            date: '2026-10-05',
                            status: 'IDEAL',
                            done: true,
                            time: null,
                        },
                    ],
                },
            ])
        );

        expect(event.title).toBe('✓ Read');
        expect(event.color).toBe('#008000');
    });

    it('draws a day with a reminder as a short timed block', () => {
        const [event] = habitsToEvents(
            calendar([
                {
                    uid: 'h2',
                    name: 'Meds',
                    icon_id: null,
                    color_argb: null,
                    group_uid: null,
                    days: [
                        {
                            date: '2026-10-05',
                            status: 'MISSED',
                            done: false,
                            time: '08:30',
                        },
                    ],
                },
            ])
        );

        expect(event.allDay).toBe(false);
        expect(event.start).toEqual(new Date(2026, 9, 5, 8, 30));
        expect(event.end).toEqual(new Date(2026, 9, 5, 9, 0));
    });

    it('gives one item per habit and day, and nothing for no habits', () => {
        expect(habitsToEvents(calendar([]))).toEqual([]);
        const events = habitsToEvents(
            calendar(
                ['a', 'b'].map((uid) => ({
                    uid,
                    name: uid,
                    icon_id: null,
                    color_argb: null,
                    group_uid: null,
                    days: ['2026-10-05', '2026-10-06'].map((date) => ({
                        date,
                        status: 'MISSED' as const,
                        done: false,
                        time: null,
                    })),
                }))
            )
        );
        expect(new Set(events.map((e) => e.id)).size).toBe(4);
    });
});

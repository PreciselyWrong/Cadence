import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView from '../Calendar/CalendarDayView';
import CalendarWeekView from '../Calendar/CalendarWeekView';
import CalendarMonthView from '../Calendar/CalendarMonthView';
import {
    layoutAllDayWeek,
    taskIdOf,
    moveUpdate,
    resizeUpdate,
    taskToEvents,
} from '../Calendar/taskEvents';

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

// jsdom has no PointerEvent; a MouseEvent carries the clientY the resize reads.
if (!(window as any).PointerEvent) {
    (window as any).PointerEvent = window.MouseEvent;
}

const minutes = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;

describe('taskToEvents', () => {
    it('uses the due time and the estimate for a timed task', () => {
        const [event] = taskToEvents({
            id: 1,
            name: 'Write',
            due_date: '2026-10-29',
            due_time: '14:30',
            estimated_minutes: 90,
        });
        expect(event.start).toEqual(new Date(2026, 9, 29, 14, 30));
        expect(minutes(event.start, event.end)).toBe(90);
        expect(event.resize).toBe('estimate');
        expect(event.allDay).toBeFalsy();
    });

    it('falls back to an hour without an estimate', () => {
        const [event] = taskToEvents({
            id: 1,
            due_date: '2026-10-29',
            due_time: '09:00',
        });
        expect(minutes(event.start, event.end)).toBe(60);
    });

    it('runs from the start time to the due time on the same day', () => {
        const [event] = taskToEvents({
            id: 1,
            due_date: '2026-10-29',
            due_time: '11:00',
            start_date: '2026-10-29',
            start_time: '09:15',
        });
        expect(event.start).toEqual(new Date(2026, 9, 29, 9, 15));
        expect(event.end).toEqual(new Date(2026, 9, 29, 11, 0));
        expect(event.resize).toBe('due');
    });

    it('draws a whole-day bar from the start day to the due day', () => {
        const [event] = taskToEvents({
            id: 1,
            due_date: '2026-10-30',
            start_date: '2026-10-27',
        });
        expect(event.allDay).toBe(true);
        expect(event.start).toEqual(new Date(2026, 9, 27));
        expect(event.end).toEqual(new Date(2026, 9, 31));
        expect(event.resize).toBeUndefined();
    });

    it('draws a one-day bar for a whole-day due date', () => {
        const [event] = taskToEvents({ id: 1, due_date: '2026-10-30' });
        expect(event.allDay).toBe(true);
        expect(minutes(event.start, event.end)).toBe(24 * 60);
    });
});

describe('moveUpdate and resizeUpdate', () => {
    it('moves a timed task by its due date and time', () => {
        const task = { id: 1, due_date: '2026-10-29', due_time: '14:00' };
        const [event] = taskToEvents(task);
        expect(moveUpdate(task, event, new Date(2026, 9, 30, 8, 0))).toEqual({
            due_date: '2026-10-30',
            due_time: '08:00',
        });
    });

    it('moves both ends of a start-to-due block', () => {
        const task = {
            id: 1,
            due_date: '2026-10-29',
            due_time: '11:00',
            start_date: '2026-10-29',
            start_time: '09:00',
        };
        const [event] = taskToEvents(task);
        expect(moveUpdate(task, event, new Date(2026, 9, 29, 13, 0))).toEqual({
            start_date: '2026-10-29',
            start_time: '13:00',
            due_date: '2026-10-29',
            due_time: '15:00',
        });
    });

    it('shifts a whole-day span by days', () => {
        const task = {
            id: 1,
            due_date: '2026-10-30',
            start_date: '2026-10-27',
        };
        const [event] = taskToEvents(task);
        expect(moveUpdate(task, event, new Date(2026, 10, 2))).toEqual({
            due_date: '2026-11-05',
            start_date: '2026-11-02',
        });
    });

    it('saves the estimate, bounded to 5 minutes – 12 hours', () => {
        const [event] = taskToEvents({
            id: 1,
            due_date: '2026-10-29',
            due_time: '14:00',
        });
        expect(resizeUpdate(event, new Date(2026, 9, 29, 15, 45))).toEqual({
            estimated_minutes: 105,
        });
        expect(resizeUpdate(event, new Date(2026, 9, 29, 14, 0))).toEqual({
            estimated_minutes: 5,
        });
        expect(resizeUpdate(event, new Date(2026, 9, 30, 14, 0))).toEqual({
            estimated_minutes: 720,
        });
    });

    it('saves the due time for a start-to-due block', () => {
        const [event] = taskToEvents({
            id: 1,
            due_date: '2026-10-29',
            due_time: '11:00',
            start_date: '2026-10-29',
            start_time: '09:00',
        });
        expect(resizeUpdate(event, new Date(2026, 9, 29, 12, 30))).toEqual({
            due_date: '2026-10-29',
            due_time: '12:30',
        });
    });
});

describe('calendar views with task blocks', () => {
    const day = new Date(2026, 9, 29);

    it('reports the new end when the bottom edge is dragged in the day view', () => {
        const onEventResize = jest.fn();
        render(
            <CalendarDayView
                currentDate={day}
                events={taskToEvents({
                    id: 7,
                    name: 'Draft',
                    due_date: '2026-10-29',
                    due_time: '10:00',
                })}
                onEventResize={onEventResize}
            />
        );
        const handle = screen.getByTestId('calendar-resize-handle');
        fireEvent.pointerDown(handle, { clientY: 100 });
        // Day view hours are 48px tall: 36px is 45 minutes.
        fireEvent.pointerMove(window, { clientY: 136 });
        fireEvent.pointerUp(window);
        expect(onEventResize).toHaveBeenCalledWith(
            'task-7',
            new Date(2026, 9, 29, 11, 45)
        );
    });

    it('shows a whole-day span in the week all-day row, not the hour grid', async () => {
        render(
            <CalendarWeekView
                currentDate={day}
                events={taskToEvents({
                    id: 8,
                    name: 'Trip',
                    due_date: '2026-10-30',
                    start_date: '2026-10-27',
                })}
            />
        );
        const row = await screen.findByTestId('calendar-all-day-row');
        const bar = screen.getByTitle('Trip');
        expect(row).toContainElement(bar);
        // Week starts Monday 26th: Tue 27 → Fri 30 is columns 3..7.
        expect(bar.style.gridColumn).toBe('3 / 7');
    });
});

describe('whole-day bar rows', () => {
    const bars = [
        { id: 'a', due_date: '2026-10-28', start_date: '2026-10-26' },
        { id: 'b', due_date: '2026-10-29', start_date: '2026-10-27' },
        { id: 'c', due_date: '2026-10-30', start_date: '2026-10-29' },
    ].flatMap(taskToEvents);

    it('reuses a row once the bar above has ended', () => {
        const rows = layoutAllDayWeek(bars, new Date(2026, 9, 26));
        expect(rows.get('task-a')).toBe(0);
        expect(rows.get('task-b')).toBe(1);
        expect(rows.get('task-c')).toBe(0);
    });

    it('keeps a span on its row in the month view, leaving a gap', async () => {
        render(
            <CalendarMonthView
                currentDate={new Date(2026, 9, 15)}
                events={[bars[1]]}
            />
        );
        await screen.findAllByTitle(bars[1].title);
        const twentySeventh = screen
            .getAllByTitle(bars[1].title)
            .map((el) => el.parentElement);
        // One bar per covered day (27, 28, 29), each the only item.
        expect(twentySeventh).toHaveLength(3);
    });
});

describe('recurring occurrences', () => {
    it('draws a later occurrence read-only with its own id', () => {
        const [event] = taskToEvents({
            id: 4,
            due_date: '2026-11-05',
            due_time: '09:00',
            is_virtual_occurrence: true,
            occurrence_index: 2,
        });
        expect(event.id).toBe('task-4-occ-2');
        expect(event.readOnly).toBe(true);
        expect(event.resize).toBeUndefined();
        expect(taskIdOf(event.id)).toBe('4');
    });
});

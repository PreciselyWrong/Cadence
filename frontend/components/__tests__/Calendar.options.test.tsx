import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarWeekView from '../Calendar/CalendarWeekView';
import CalendarMonthView from '../Calendar/CalendarMonthView';
import { taskColor, taskToEvents } from '../Calendar/taskEvents';
import CalendarAgendaView from '../Calendar/CalendarAgendaView';
import {
    DEFAULT_CALENDAR_OPTIONS,
    readCalendarOptions,
    visibleTasks,
} from '../Calendar/ViewOptions';

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

describe('taskColor', () => {
    const task = {
        id: 1,
        priority: 'high',
        Project: { id: 3, name: 'Home', color: '#123456' },
        tags: [{ name: 'deep' }],
    };

    it('keeps done tasks green whatever the key', () => {
        expect(
            taskColor({ ...task, completed_at: '2026-10-01' }, 'project')
        ).toBe('#22c55e');
    });

    it('uses the project colour, the priority, or a stable tag colour', () => {
        expect(taskColor(task, 'project')).toBe('#123456');
        expect(taskColor(task, 'priority')).toBe('#ef4444');
        expect(taskColor({ ...task, priority: 1 }, 'priority')).toBe('#f59e0b');
        expect(taskColor(task, 'tag')).toBe(
            taskColor({ id: 2, tags: [{ name: 'deep' }] }, 'tag')
        );
        expect(taskColor({ id: 4 }, 'project')).toBe('#6b7280');
    });
});

describe('view options', () => {
    it('falls back to the defaults for missing or bad values', () => {
        expect(readCalendarOptions(null)).toEqual(DEFAULT_CALENDAR_OPTIONS);
        expect(
            readCalendarOptions({ showWeekends: false, colorBy: 'rainbow' })
        ).toEqual({ ...DEFAULT_CALENDAR_OPTIONS, showWeekends: false });
    });

    it('hides completed tasks and repeat previews when asked', () => {
        const tasks = [
            { id: 1, status: 0 },
            { id: 2, status: 'done' },
            { id: 3, status: 0, is_virtual_occurrence: true },
        ];
        expect(
            visibleTasks(tasks, {
                ...DEFAULT_CALENDAR_OPTIONS,
                showCompleted: false,
                showRepeats: false,
            }).map((t) => t.id)
        ).toEqual([1]);
        expect(visibleTasks(tasks, DEFAULT_CALENDAR_OPTIONS)).toHaveLength(3);
    });

    it('drops Saturday and Sunday from the week view', async () => {
        render(
            <CalendarWeekView
                currentDate={new Date(2026, 9, 29)}
                events={[]}
                showWeekends={false}
            />
        );
        await screen.findByText('Mon');
        expect(screen.queryByText('Sat')).not.toBeInTheDocument();
        expect(screen.queryByText('Sun')).not.toBeInTheDocument();
        expect(screen.getByText('Fri')).toBeInTheDocument();
    });

    it('drops weekend columns from the month view', async () => {
        render(
            <CalendarMonthView
                currentDate={new Date(2026, 9, 15)}
                events={[]}
                showWeekends={false}
            />
        );
        await screen.findByText('Mon');
        expect(screen.queryByText('Sat')).not.toBeInTheDocument();
        // 31 Oct 2026 is a Saturday.
        expect(screen.queryByText('31')).not.toBeInTheDocument();
    });
});

describe('multi-day and agenda views', () => {
    it('shows N days from the current date, skipping weekends when hidden', async () => {
        render(
            <CalendarWeekView
                currentDate={new Date(2026, 9, 30)}
                events={[]}
                dayCount={3}
                showWeekends={false}
            />
        );
        // Fri 30 Oct, then Mon 2 and Tue 3 Nov.
        await screen.findByText('Fri');
        expect(screen.getByText('Mon')).toBeInTheDocument();
        expect(screen.getByText('Tue')).toBeInTheDocument();
        expect(screen.queryByText('Sat')).not.toBeInTheDocument();
        expect(screen.queryByText('Wed')).not.toBeInTheDocument();
    });

    it('lists the window day by day in order', () => {
        render(
            <CalendarAgendaView
                start={new Date(2026, 9, 1)}
                end={new Date(2026, 9, 31)}
                events={[
                    ...taskToEvents({
                        id: 1,
                        name: 'Later',
                        due_date: '2026-10-20',
                        due_time: '10:00',
                    }),
                    ...taskToEvents({
                        id: 2,
                        name: 'Trip',
                        due_date: '2026-10-06',
                        start_date: '2026-10-05',
                    }),
                ]}
            />
        );
        const headings = screen
            .getAllByRole('heading')
            .map((h) => h.textContent);
        expect(headings).toEqual([
            'Monday 5 October',
            'Tuesday 6 October',
            'Tuesday 20 October',
        ]);
        expect(screen.getByText('10:00 – 11:00')).toBeInTheDocument();
    });
});

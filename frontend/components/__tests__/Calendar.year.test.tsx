import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarYearView, {
    countByDay,
    MonthGrid,
    heatLevel,
} from '../Calendar/CalendarYearView';
import CalendarWeekView from '../Calendar/CalendarWeekView';
import CalendarMonthView from '../Calendar/CalendarMonthView';
import { taskToEvents } from '../Calendar/taskEvents';

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

const events = [
    { id: 1, due_date: '2026-03-10', due_time: '09:00' },
    { id: 2, due_date: '2026-03-10', due_time: '11:00' },
    { id: 3, due_date: '2026-03-12', start_date: '2026-03-10' },
].flatMap((task) => taskToEvents(task));

describe('year view', () => {
    it('counts items per day, whole-day bars on each day', () => {
        const counts = countByDay(events);
        expect(counts.get('2026-03-10')).toBe(3);
        expect(counts.get('2026-03-11')).toBe(1);
        expect(counts.get('2026-03-12')).toBe(1);
        expect(counts.get('2026-03-13')).toBeUndefined();
        expect(heatLevel(0)).toBe(0);
        expect(heatLevel(9)).toBe(4);
    });

    it('shows twelve months and opens a clicked day', () => {
        const onDayClick = jest.fn();
        render(
            <CalendarYearView
                currentDate={new Date(2026, 5, 1)}
                events={events}
                weekStartsOn={1}
                onDayClick={onDayClick}
            />
        );
        expect(screen.getAllByRole('heading')).toHaveLength(12);
        const busy = document.querySelector('[data-count="3"]') as HTMLElement;
        fireEvent.click(busy);
        expect(onDayClick).toHaveBeenCalledWith(new Date(2026, 2, 10));
    });
});

describe('week numbers', () => {
    it('labels the week view with its ISO week', async () => {
        render(
            <CalendarWeekView
                currentDate={new Date(2026, 9, 29)}
                events={[]}
                showWeekNumbers
            />
        );
        await screen.findByText('Mon');
        expect(document.querySelector('[data-week="44"]')).not.toBeNull();
    });

    it('labels each month row once', async () => {
        render(
            <CalendarMonthView
                currentDate={new Date(2026, 9, 15)}
                events={[]}
                showWeekNumbers
            />
        );
        await screen.findByText('Mon');
        // October 2026 spans ISO weeks 40 to 44.
        const weeks = Array.from(document.querySelectorAll('[data-week]')).map(
            (el) => el.getAttribute('data-week')
        );
        expect(weeks).toEqual(['40', '41', '42', '43', '44']);
    });
});

describe('month grid', () => {
    afterEach(() => jest.useRealTimers());

    it('marks today only inside its own month', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 9, 29, 12));
        render(
            <MonthGrid
                month={new Date(2026, 10, 1)}
                weekStartsOn={1}
                onDayClick={jest.fn()}
            />
        );
        // November's grid starts on Mon 26 Oct; the 29th there is not today's cell.
        expect(document.querySelector('.ring-1')).toBeNull();
    });
});

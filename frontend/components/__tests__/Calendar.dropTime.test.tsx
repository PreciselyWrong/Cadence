import React from 'react';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView, { HOUR_HEIGHT } from '../Calendar/CalendarDayView';
import CalendarWeekView from '../Calendar/CalendarWeekView';
import { dropMinuteOfDay } from '../Calendar/dropTime';

jest.mock('../../i18n', () => ({ __esModule: true, default: {} }));

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

const day = new Date(2026, 8, 24);

// jsdom has neither layout nor DragEvent: the cell sits at the top of the
// page and the drop carries the pointer height explicitly.
const dropAt = (cell: HTMLElement, clientY: number, eventId = 'task-1') => {
    const event = createEvent.drop(cell, {
        dataTransfer: { getData: () => eventId },
    });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(cell, event);
};

describe('dropMinuteOfDay', () => {
    it('lands in quarter hours from the pointer height in the cell', () => {
        expect(dropMinuteOfDay(14, 0, 0, 48)).toBe(14 * 60);
        expect(dropMinuteOfDay(14, 24, 0, 48)).toBe(14 * 60 + 30);
        expect(dropMinuteOfDay(14, 40, 0, 48)).toBe(14 * 60 + 45);
        expect(dropMinuteOfDay(14, 47, 0, 48)).toBe(15 * 60);
    });

    it('keeps the block where it was grabbed', () => {
        // Grabbed 12 px (15 min) below its top, dropped 36 px into 14:00.
        expect(dropMinuteOfDay(14, 36, 12, 48)).toBe(14 * 60 + 30);
        // Grabbed low: the top lands in the hour above.
        expect(dropMinuteOfDay(14, 0, 24, 48)).toBe(13 * 60 + 30);
    });

    it('stays inside the day and falls back to the hour without a pointer', () => {
        expect(dropMinuteOfDay(0, 2, 40, 48)).toBe(0);
        expect(dropMinuteOfDay(23, 47, 0, 48)).toBe(23 * 60 + 45);
        expect(dropMinuteOfDay(9, Number.NaN, 0, 48)).toBe(9 * 60);
    });
});

describe('Calendar drops on the hour grid', () => {
    it('passes the quarter hour of a drop in the day view', () => {
        const onEventDrop = jest.fn();
        render(
            <CalendarDayView
                currentDate={day}
                events={[]}
                onEventDrop={onEventDrop}
            />
        );
        dropAt(screen.getByTestId('day-slot-14'), (HOUR_HEIGHT * 3) / 4);
        expect(onEventDrop).toHaveBeenCalledWith('task-1', day, 14, 45);
    });

    it('passes the quarter hour of a drop in the week view', () => {
        const onEventDrop = jest.fn();
        render(
            <CalendarWeekView
                currentDate={day}
                events={[]}
                onEventDrop={onEventDrop}
            />
        );
        dropAt(screen.getByTestId('week-slot-2026-09-24-10'), 36);
        expect(onEventDrop).toHaveBeenCalledWith(
            'task-1',
            expect.any(Date),
            10,
            30
        );
    });
});

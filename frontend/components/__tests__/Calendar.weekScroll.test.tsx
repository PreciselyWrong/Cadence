import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarWeekView from '../Calendar/CalendarWeekView';
import { CalendarEvent } from '../Calendar/taskEvents';

jest.mock('../../i18n', () => ({ __esModule: true, default: {} }));

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

const timed = (id: string, start: Date, minutes = 30): CalendarEvent =>
    ({
        id,
        title: id,
        start,
        end: new Date(start.getTime() + minutes * 60000),
        allDay: false,
    }) as CalendarEvent;

describe('week view opening scroll', () => {
    it('opens on the hour of the earliest timed item of the week', () => {
        render(
            <CalendarWeekView
                currentDate={new Date(2026, 10, 4, 12)}
                events={[
                    timed('run', new Date(2026, 10, 5, 7, 0)),
                    timed('meditate', new Date(2026, 10, 3, 6, 30)),
                ]}
            />
        );

        expect(screen.getByTestId('week-time-grid').scrollTop).toBe(6 * 72);
    });

    it('opens at 07:00 when the week has no timed item', () => {
        render(
            <CalendarWeekView
                currentDate={new Date(2026, 10, 4, 12)}
                events={[]}
            />
        );

        expect(screen.getByTestId('week-time-grid').scrollTop).toBe(7 * 72);
    });

    it('counts from the first visible hour', () => {
        render(
            <CalendarWeekView
                currentDate={new Date(2026, 10, 4, 12)}
                events={[timed('late', new Date(2026, 10, 4, 10, 0))]}
                visibleHours={{ start: 8, end: 20 }}
            />
        );

        expect(screen.getByTestId('week-time-grid').scrollTop).toBe(2 * 72);
    });
});

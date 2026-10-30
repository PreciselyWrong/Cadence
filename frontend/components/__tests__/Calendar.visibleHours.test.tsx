import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView from '../Calendar/CalendarDayView';
import { readCalendarOptions } from '../Calendar/ViewOptions';

jest.mock('../../i18n', () => ({ __esModule: true, default: {} }));

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

describe('visible hours on the day view', () => {
    it('renders only the hours from start up to end', () => {
        render(
            <CalendarDayView
                currentDate={new Date(2026, 9, 29, 12)}
                events={[]}
                visibleHours={{ start: 6, end: 9 }}
            />
        );

        expect(screen.getByText('06:00')).toBeInTheDocument();
        expect(screen.getByText('08:00')).toBeInTheDocument();
        expect(screen.queryByText('05:00')).not.toBeInTheDocument();
        expect(screen.queryByText('09:00')).not.toBeInTheDocument();
    });

    it('shows every hour by default', () => {
        render(
            <CalendarDayView
                currentDate={new Date(2026, 9, 29, 12)}
                events={[]}
            />
        );

        expect(screen.getByText('00:00')).toBeInTheDocument();
        expect(screen.getByText('23:00')).toBeInTheDocument();
    });
});

describe('readCalendarOptions visibleHours', () => {
    it('defaults to the whole day', () => {
        expect(readCalendarOptions({}).visibleHours).toEqual({
            start: 0,
            end: 24,
        });
    });

    it('reads a saved range', () => {
        expect(
            readCalendarOptions({ visibleHours: { start: 5, end: 22 } })
                .visibleHours
        ).toEqual({ start: 5, end: 22 });
    });

    it('falls back to the whole day for an invalid range', () => {
        expect(
            readCalendarOptions({ visibleHours: { start: 12, end: 12 } })
                .visibleHours
        ).toEqual({ start: 0, end: 24 });
    });
});

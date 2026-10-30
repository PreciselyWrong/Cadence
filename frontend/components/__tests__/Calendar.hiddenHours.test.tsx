import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView from '../Calendar/CalendarDayView';
import { CalendarEvent } from '../Calendar/taskEvents';
import { countOutside } from '../Calendar/visibleHours';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, arg?: any, options?: any) => {
            const fallback = typeof arg === 'string' ? arg : arg?.defaultValue;
            const vars = typeof arg === 'string' ? options : arg;
            if (typeof fallback !== 'string') return key;
            return fallback.replace(
                /\{\{(\w+)\}\}/g,
                (_: string, name: string) => vars?.[name] ?? ''
            );
        },
    }),
}));

jest.mock('../../i18n', () => ({ __esModule: true, default: {} }));

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

const DAY = new Date(2026, 9, 29, 12);

const timed = (
    id: string,
    title: string,
    startHour: number,
    endHour: number
): CalendarEvent => ({
    id,
    title,
    type: 'task',
    start: new Date(2026, 9, 29, startHour, 0),
    end: new Date(2026, 9, 29, endHour, 0),
});

describe('countOutside', () => {
    const window = { start: 6, end: 22 };

    it('reports an event entirely before the window as earlier', () => {
        const event = timed('a', 'Early', 3, 4);
        expect(countOutside([event], DAY, window)).toEqual({
            before: [event],
            after: [],
        });
    });

    it('reports an event starting before and running into the window as earlier', () => {
        const event = timed('a', 'Overlap', 5, 7);
        expect(countOutside([event], DAY, window).before).toEqual([event]);
    });

    it('reports an event entirely after the window as later', () => {
        const event = timed('a', 'Late', 23, 23);
        expect(countOutside([event], DAY, window)).toEqual({
            before: [],
            after: [event],
        });
    });

    it('reports an event running past the end of the window as later', () => {
        const event = timed('a', 'Overlap end', 21, 23);
        expect(countOutside([event], DAY, window).after).toEqual([event]);
    });

    it('ignores events inside the window', () => {
        const event = timed('a', 'Inside', 9, 10);
        expect(countOutside([event], DAY, window)).toEqual({
            before: [],
            after: [],
        });
    });

    it('ignores all-day items and events on other days', () => {
        const allDay: CalendarEvent = {
            id: 'd',
            title: 'Holiday',
            type: 'event',
            allDay: true,
            start: new Date(2026, 9, 29),
            end: new Date(2026, 9, 30),
        };
        const otherDay = {
            ...timed('o', 'Other day', 3, 4),
            start: new Date(2026, 9, 30, 3),
            end: new Date(2026, 9, 30, 4),
        };
        expect(countOutside([allDay, otherDay], DAY, window)).toEqual({
            before: [],
            after: [],
        });
    });

    it('lists the earlier items in start order', () => {
        const first = timed('a', 'First', 1, 2);
        const second = timed('b', 'Second', 4, 5);
        expect(
            countOutside([second, first], DAY, window).before.map((e) => e.id)
        ).toEqual(['a', 'b']);
    });
});

describe('hidden hours on the day view', () => {
    const early = timed('early', 'Early meeting', 3, 4);

    it('shows how many items are earlier than the window', () => {
        render(
            <CalendarDayView
                currentDate={DAY}
                events={[early]}
                visibleHours={{ start: 6, end: 24 }}
            />
        );

        expect(screen.getByText('1 earlier')).toBeInTheDocument();
        expect(screen.queryByText('03:00')).not.toBeInTheDocument();
        expect(screen.queryByText('Early meeting')).not.toBeInTheDocument();
    });

    it('expands the grid on click and collapses it again', () => {
        render(
            <CalendarDayView
                currentDate={DAY}
                events={[early]}
                visibleHours={{ start: 6, end: 24 }}
            />
        );

        fireEvent.click(screen.getByText('1 earlier'));
        expect(screen.getByText('03:00')).toBeInTheDocument();
        expect(screen.getByText('Early meeting')).toBeInTheDocument();
        expect(
            screen.getByText('Hide early and late hours')
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText('Hide early and late hours'));
        expect(screen.queryByText('03:00')).not.toBeInTheDocument();
        expect(screen.getByText('1 earlier')).toBeInTheDocument();
    });

    it('shows no bar for the whole day', () => {
        render(<CalendarDayView currentDate={DAY} events={[early]} />);

        expect(screen.queryByText(/earlier/)).not.toBeInTheDocument();
    });
});

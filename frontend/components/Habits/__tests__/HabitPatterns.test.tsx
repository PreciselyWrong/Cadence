import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HabitPatterns from '../HabitPatterns';
import type {
    CadenceDayEntry,
    CadencePatterns,
} from '../../../utils/cadenceHabitsService';

jest.mock('react-i18next', () => jest.requireActual('./testI18n').mockI18n);

const DAY_MS = 86_400_000;

const yearOfDays = (): CadenceDayEntry[] =>
    Array.from({ length: 365 }, (_, index) => ({
        date: new Date(Date.UTC(2025, 10, 6) + index * DAY_MS)
            .toISOString()
            .slice(0, 10),
        status: index % 3 === 0 ? 'IDEAL' : 'NO_ACTIVITY',
    }));

const WEEKDAYS = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
] as const;

const patterns = (over: Partial<CadencePatterns> = {}): CadencePatterns => ({
    weekdays: WEEKDAYS.map((day, index) => ({
        day,
        done: index === 0 ? 2 : 0,
        counted: index === 0 ? 4 : 0,
        ratePercent: index === 0 ? 50 : null,
    })),
    months: Array.from({ length: 13 }, (_, index) => ({
        month: `2025-${String(index + 1).padStart(2, '0')}`,
        done: 1,
        counted: 2,
        ratePercent: 50,
    })),
    year: { done: 40, counted: 80, ratePercent: 50 },
    ...over,
});

describe('HabitPatterns', () => {
    it('renders one heatmap cell per calendar day', () => {
        render(
            <HabitPatterns patterns={patterns()} calendarDays={yearOfDays()} />
        );

        expect(screen.getAllByTestId('heatmap-cell')).toHaveLength(365);
    });

    it('labels each weekday bar with its rate, or a dash without data', () => {
        render(
            <HabitPatterns patterns={patterns()} calendarDays={yearOfDays()} />
        );

        expect(
            screen.getByRole('img', { name: 'Mon: 50 %' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('img', { name: 'Tue: not enough days' })
        ).toBeInTheDocument();
        expect(screen.getAllByText('–')).toHaveLength(6);
    });

    it('shows the last 12 months only', () => {
        render(
            <HabitPatterns patterns={patterns()} calendarDays={yearOfDays()} />
        );

        // 7 weekday bars + 12 month bars.
        expect(screen.getAllByRole('img')).toHaveLength(19);
    });

    it('says there are not enough days when the year has no rate', () => {
        render(
            <HabitPatterns
                patterns={patterns({
                    year: { done: 0, counted: 3, ratePercent: null },
                })}
                calendarDays={yearOfDays()}
            />
        );

        expect(screen.getByText('Not enough days yet')).toBeInTheDocument();
    });

    it('gives the year rate with its counts', () => {
        render(
            <HabitPatterns patterns={patterns()} calendarDays={yearOfDays()} />
        );

        expect(
            screen.getByText('Over 12 months: 50 % (40 of 80 days)')
        ).toBeInTheDocument();
    });
});

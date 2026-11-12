import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SidebarMiniMonth from '../SidebarMiniMonth';
import { getFirstDayOfWeek } from '../../../utils/profileService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        i18n: { language: 'en' },
    }),
}));
jest.mock('../../../utils/dateUtils', () => ({
    getUserTimezone: () => 'Europe/Paris',
}));
jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn(() => Promise.resolve(1)),
}));

const LocationProbe = () => {
    const { pathname, search } = useLocation();
    return <div data-testid="location">{`${pathname}${search}`}</div>;
};

const renderMonth = (initialEntry = '/somewhere') =>
    render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route
                    path="*"
                    element={
                        <>
                            <SidebarMiniMonth />
                            <LocationProbe />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>
    );

const location = () => screen.getByTestId('location').textContent;

const dayButton = (date: string) =>
    document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;

describe('SidebarMiniMonth', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-11-12T10:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('renders November 2026 with 42 day buttons', async () => {
        await act(async () => {
            renderMonth();
        });

        expect(screen.getByText('November')).toBeInTheDocument();
        expect(screen.getByText('2026')).toBeInTheDocument();
        expect(document.querySelectorAll('[data-date]')).toHaveLength(42);
    });

    it('marks today with aria-current', async () => {
        await act(async () => {
            renderMonth();
        });

        const today = screen.getByRole('button', {
            name: 'Thursday, November 12, 2026',
        });
        expect(today).toHaveAttribute('aria-current', 'date');
        expect(
            screen.getByRole('button', { name: 'Friday, November 13, 2026' })
        ).not.toHaveAttribute('aria-current');
    });

    it('navigates to /today?date= when a past or future day is clicked', async () => {
        await act(async () => {
            renderMonth();
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'Saturday, November 14, 2026' })
        );

        expect(location()).toBe('/today?date=2026-11-14');
    });

    it('navigates to /today when today is clicked', async () => {
        await act(async () => {
            renderMonth('/today?date=2026-11-20');
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'Thursday, November 12, 2026' })
        );

        expect(location()).toBe('/today');
    });

    it('shows December after the next month button', async () => {
        await act(async () => {
            renderMonth();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

        expect(screen.getByText('December')).toBeInTheDocument();
        expect(dayButton('2026-12-03')).toBeInTheDocument();
    });

    it('shows the month of the route date and presses that day', async () => {
        await act(async () => {
            renderMonth('/today?date=2026-12-03');
        });

        expect(screen.getByText('December')).toBeInTheDocument();
        expect(dayButton('2026-12-03')).toHaveAttribute('aria-pressed', 'true');
        expect(document.querySelectorAll('[aria-pressed]')).toHaveLength(1);
    });

    it('moves focus to the next day with ArrowRight', async () => {
        await act(async () => {
            renderMonth();
        });

        const today = dayButton('2026-11-12');
        today.focus();
        fireEvent.keyDown(today, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(dayButton('2026-11-13'));
        expect(dayButton('2026-11-13')).toHaveAttribute('tabindex', '0');
        expect(today).toHaveAttribute('tabindex', '-1');
    });

    it('starts the week on Monday by default', async () => {
        await act(async () => {
            renderMonth();
        });

        expect(getFirstDayOfWeek).toHaveBeenCalled();
        const cells = document.querySelectorAll('[data-date]');
        expect(cells[0]).toHaveAttribute('data-date', '2026-10-26');
        expect(screen.getByText('M', { selector: 'span' })).toBeInTheDocument();
    });
});

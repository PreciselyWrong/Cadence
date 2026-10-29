import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FocusStats from '../FocusStats';
import { fetchFocusStats } from '../../../utils/focusSessionsService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));
jest.mock('../../../utils/focusSessionsService', () => ({
    fetchFocusStats: jest.fn(),
}));

const byHour = Array(24).fill(0);
byHour[9] = 50;
byHour[14] = 25;

describe('FocusStats', () => {
    beforeEach(() => {
        (fetchFocusStats as jest.Mock).mockResolvedValue({
            days: 7,
            total_minutes: 75,
            sessions: 3,
            by_day: [
                { date: '2026-10-28', minutes: 25 },
                { date: '2026-10-29', minutes: 50 },
            ],
            by_hour: byHour,
            top_tasks: [{ uid: 't', name: 'Write', minutes: 50 }],
        });
    });

    it('shows the totals, the busiest hour and the top tasks', async () => {
        render(<FocusStats />);
        expect(await screen.findByTestId('focus-total')).toHaveTextContent(
            '1 h 15'
        );
        expect(screen.getByTestId('focus-sessions')).toHaveTextContent('3');
        expect(screen.getByTestId('focus-hour')).toHaveTextContent('09:00');
        expect(screen.getByText('Write')).toBeInTheDocument();
        expect(screen.getByTitle('09:00: 50 min')).toBeInTheDocument();
    });

    it('reloads for another range', async () => {
        render(<FocusStats />);
        await screen.findByTestId('focus-total');
        fireEvent.click(screen.getAllByRole('button')[2]);
        await waitFor(() =>
            expect(fetchFocusStats).toHaveBeenLastCalledWith(90)
        );
    });

    it('explains how to start when there is nothing yet', async () => {
        (fetchFocusStats as jest.Mock).mockResolvedValue({
            days: 30,
            total_minutes: 0,
            sessions: 0,
            by_day: [],
            by_hour: Array(24).fill(0),
            top_tasks: [],
        });
        render(<FocusStats />);
        expect(
            await screen.findByText(/No focus sessions yet/)
        ).toBeInTheDocument();
    });
});

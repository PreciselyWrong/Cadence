import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';
import HabitDetails from '../HabitDetails';
import * as api from '../../../utils/cadenceHabitsService';
import { detail, evaluation, minutesGoal } from './fixtures';

jest.mock('react-i18next', () => jest.requireActual('./testI18n').mockI18n);
jest.mock('../../../utils/cadenceHabitsService', () => ({
    ...jest.requireActual('../../../utils/cadenceHabitsService'),
    fetchCadenceHabit: jest.fn(),
    fetchCadenceGroups: jest.fn(),
    fetchEntries: jest.fn(),
    updateRow: jest.fn(),
    deleteRow: jest.fn(),
    createRow: jest.fn(),
}));

const service = api as jest.Mocked<typeof api>;

const entry = (over: Partial<api.CadenceEntry> = {}): api.CadenceEntry => ({
    uid: 'e1',
    habit_uid: 'h1',
    occurred_at: '2026-10-05T08:00:00.000Z',
    local_date: '2026-10-05',
    observed_zone_id: 'UTC',
    value_minor: 900,
    source: 'MANUAL',
    session_id: null,
    note: 'matin',
    ...over,
});

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/habit/h1']}>
            <Routes>
                <Route path="/habit/:uid" element={<HabitDetails />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    jest.resetAllMocks();
    service.fetchCadenceGroups.mockResolvedValue([]);
    service.fetchEntries.mockResolvedValue([entry()]);
    service.updateRow.mockResolvedValue({});
    service.fetchCadenceHabit.mockResolvedValue(
        detail({
            goal: minutesGoal(),
            goals: [minutesGoal()],
            status: {
                date: '2026-10-05',
                evaluation: evaluation({
                    progress_minor: 900,
                    target_minor: 1800,
                }),
                streak: { current: 3, best: 7 },
            },
            pauses: [
                {
                    uid: 'p1',
                    habit_uid: 'h1',
                    start: '2026-10-01',
                    end_exclusive: null,
                    reason: 'TRAVEL',
                    reason_label: null,
                },
            ],
        })
    );
});

describe('HabitDetails', () => {
    it('shows the streak, the entries of the month and the version in force', async () => {
        renderPage();
        expect(
            await screen.findByRole('heading', { name: 'Lire' })
        ).toBeInTheDocument();
        expect(screen.getByText('3 periods in a row')).toBeInTheDocument();
        expect(screen.getByText('matin')).toBeInTheDocument();
        expect(screen.getByText('Current')).toBeInTheDocument();
        expect(service.fetchEntries).toHaveBeenCalledWith('h1', {
            from: '2026-10-01',
            to: '2026-10-31',
        });
    });

    it('edits an entry in a panel', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', {
                name: /Edit the entry of/,
            })
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Edit entry',
        });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByLabelText('Amount (min)')).toHaveValue('15');
    });

    it('ends a pause in progress today', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'End the pause' })
        );
        await waitFor(() =>
            expect(service.updateRow).toHaveBeenCalledWith(
                'h1',
                'pauses',
                'p1',
                {
                    end_exclusive: '2026-10-05',
                }
            )
        );
    });

    it('says when the habit does not exist', async () => {
        service.fetchCadenceHabit.mockRejectedValue(
            new api.CadenceHabitError(404, 'Habit not found')
        );
        renderPage();
        expect(
            await screen.findByText('This habit does not exist.')
        ).toBeInTheDocument();
    });
});

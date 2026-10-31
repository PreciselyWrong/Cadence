import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Habits from '../Habits';
import * as api from '../../../utils/cadenceHabitsService';
import { evaluation, goal, habit, minutesGoal, quick } from './fixtures';

jest.mock('react-i18next', () => jest.requireActual('./testI18n').mockI18n);
jest.mock('../../../utils/cadenceHabitsService', () => ({
    ...jest.requireActual('../../../utils/cadenceHabitsService'),
    fetchCadenceHabits: jest.fn(),
    fetchCadenceGroups: jest.fn(),
    fetchRows: jest.fn(),
    createRow: jest.fn(),
    updateCadenceHabit: jest.fn(),
}));

const service = api as jest.Mocked<typeof api>;

const groups = [
    {
        uid: 'group-day',
        name: 'Journée',
        start_minute: null,
        end_minute: null,
        sort_order: 0,
    },
    {
        uid: 'group-morning',
        name: 'Matin',
        start_minute: 300,
        end_minute: 720,
        sort_order: 1,
    },
];

const list = (habits: api.CadenceHabit[]) => ({
    date: '2026-10-05',
    timezone: 'Europe/Zurich',
    habits,
});

const renderPage = () =>
    render(
        <MemoryRouter>
            <Habits />
        </MemoryRouter>
    );

beforeEach(() => {
    jest.resetAllMocks();
    service.fetchCadenceGroups.mockResolvedValue(groups);
    service.fetchRows.mockResolvedValue([]);
    service.createRow.mockResolvedValue({});
});

describe('Habits page', () => {
    it('groups the habits by time of day', async () => {
        service.fetchCadenceHabits.mockResolvedValue(
            list([
                habit({
                    uid: 'a',
                    name: 'Méditer',
                    group_uid: 'group-morning',
                }),
                habit({ uid: 'b', name: 'Lire', group_uid: null }),
            ])
        );
        renderPage();
        const morning = await screen.findByRole('region', { name: /Matin/ });
        expect(within(morning).getByText('Méditer')).toBeInTheDocument();
        const day = screen.getByRole('region', { name: /Journée/ });
        expect(within(day).getByText('Lire')).toBeInTheDocument();
    });

    it('logs a yes/no habit with one tap and reloads the day', async () => {
        service.fetchCadenceHabits.mockResolvedValue(list([habit()]));
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Mark Lire as done' })
        );
        await waitFor(() =>
            expect(service.createRow).toHaveBeenCalledWith('h1', 'entries', {
                value_minor: 1,
                note: null,
            })
        );
        // the page asks again for the habits and the archived ones
        await waitFor(() =>
            expect(
                service.fetchCadenceHabits.mock.calls.length
            ).toBeGreaterThan(2)
        );
    });

    it('offers the quick values the habit was given', async () => {
        const run = habit({
            uid: 'run',
            name: 'Courir',
            goal: minutesGoal({ habit_uid: 'run' }),
            status: {
                date: '2026-10-05',
                evaluation: evaluation({ target_minor: 1800 }),
                streak: null,
            },
        });
        service.fetchCadenceHabits.mockResolvedValue(list([run]));
        service.fetchRows.mockResolvedValue([quick('q1', 900, 'run')]);
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: /^Add 15 min to Courir/ })
        );
        await waitFor(() =>
            expect(service.createRow).toHaveBeenCalledWith('run', 'entries', {
                value_minor: 900,
                note: null,
            })
        );
    });

    it('says when the call to the server fails and tries again', async () => {
        let down = true;
        service.fetchCadenceHabits.mockImplementation(async () => {
            if (down) throw new Error('boom');
            return list([habit()]);
        });
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not load your habits.'
        );
        down = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Lire')).toBeInTheDocument();
    });

    it('invites to create the first habit', async () => {
        service.fetchCadenceHabits.mockResolvedValue(list([]));
        renderPage();
        expect(await screen.findByText('No habits yet.')).toBeInTheDocument();
    });

    it('opens the editor from the new habit button', async () => {
        service.fetchCadenceHabits.mockResolvedValue(list([habit()]));
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'New habit' })
        );
        expect(
            await screen.findByRole('dialog', { name: 'New habit' })
        ).toBeInTheDocument();
    });

    it('restores an archived habit', async () => {
        service.fetchCadenceHabits.mockImplementation(async (options) =>
            list(
                options?.archived
                    ? [
                          habit({
                              uid: 'old',
                              name: 'Ancienne',
                              archived: true,
                              goal: goal(),
                          }),
                      ]
                    : [habit()]
            )
        );
        service.updateCadenceHabit.mockResolvedValue({} as never);
        renderPage();
        fireEvent.click(await screen.findByRole('tab', { name: /Archived/ }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Restore Ancienne' })
        );
        await waitFor(() =>
            expect(service.updateCadenceHabit).toHaveBeenCalledWith('old', {
                archived: false,
            })
        );
    });
});

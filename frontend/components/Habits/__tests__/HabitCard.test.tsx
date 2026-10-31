import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import HabitCard from '../HabitCard';
import { evaluation, goal, habit, minutesGoal, quick } from './fixtures';

jest.mock('react-i18next', () => jest.requireActual('./testI18n').mockI18n);

const renderCard = (
    props: Partial<React.ComponentProps<typeof HabitCard>> = {}
) => {
    const onLog = jest.fn().mockResolvedValue(undefined);
    render(
        <MemoryRouter>
            <HabitCard
                habit={habit()}
                quickValues={[]}
                onLog={onLog}
                {...props}
            />
        </MemoryRouter>
    );
    return onLog;
};

describe('HabitCard', () => {
    it('links the name to the habit and states what is left to do', () => {
        renderCard();
        expect(screen.getByRole('link', { name: 'Lire' })).toHaveAttribute(
            'href',
            '/habit/h1'
        );
        expect(screen.getByText('To do')).toBeInTheDocument();
    });

    it('logs a yes/no habit in one tap', async () => {
        const onLog = renderCard();
        fireEvent.click(
            screen.getByRole('button', { name: 'Mark Lire as done' })
        );
        await waitFor(() => expect(onLog).toHaveBeenCalled());
        expect(onLog.mock.calls[0].slice(1)).toEqual([1, undefined]);
    });

    it('shows a done habit as done, without an action', () => {
        renderCard({
            habit: habit({
                status: {
                    date: '2026-10-05',
                    evaluation: evaluation({
                        is_completed: true,
                        progress_minor: 1,
                        attainment: 'IDEAL',
                    }),
                    streak: { current: 4, best: 6 },
                },
            }),
        });
        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Mark Lire as done/ })
        ).toBeNull();
        expect(screen.getByText('4 periods in a row')).toBeInTheDocument();
    });

    it('logs the first quick value of an amount habit and lists the others', async () => {
        const g = minutesGoal();
        const onLog = renderCard({
            habit: habit({
                goal: g,
                status: {
                    date: '2026-10-05',
                    evaluation: evaluation({
                        progress_minor: 600,
                        target_minor: 1800,
                    }),
                    streak: null,
                },
            }),
            quickValues: [quick('q1', 900), quick('q2', 1800)],
        });
        expect(screen.getByText('10 min / 30 min')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Add 15 min/ }));
        await waitFor(() => expect(onLog).toHaveBeenCalled());
        expect(onLog.mock.calls[0][1]).toBe(900);

        const more = screen.getByRole('button', {
            name: 'More amounts for Lire',
        });
        expect(more).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(more);
        expect(more).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('button', { name: '+30 min' }));
        await waitFor(() => expect(onLog).toHaveBeenCalledTimes(2));
        expect(onLog.mock.calls[1][1]).toBe(1800);
    });

    it('logs a free amount with a note', async () => {
        const g = minutesGoal();
        const onLog = renderCard({
            habit: habit({ goal: g }),
            quickValues: [quick('q1', 900)],
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'More amounts for Lire' })
        );
        fireEvent.change(screen.getByLabelText('Other amount'), {
            target: { value: '45' },
        });
        fireEvent.change(screen.getByLabelText('Note (optional)'), {
            target: { value: 'chapitre 3' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(onLog).toHaveBeenCalled());
        expect(onLog.mock.calls[0].slice(1)).toEqual([2700, 'chapitre 3']);
    });

    it('reads a limit as a maximum and flags it once exceeded', () => {
        renderCard({
            habit: habit({
                goal: goal({
                    goal_type: 'COUNT',
                    direction: 'AT_MOST',
                    target_minor: 2,
                    unit_id: 'glass',
                    unit_dimension: 'COUNT',
                    unit_name_fr: 'Verres',
                    unit_symbol: 'verres',
                    unit_scale_to_canonical: 1,
                }),
                status: {
                    date: '2026-10-05',
                    evaluation: evaluation({
                        progress_minor: 3,
                        target_minor: 2,
                        limit_status: 'EXCEEDED',
                    }),
                    streak: null,
                },
            }),
        });
        expect(
            screen.getByText('3 of 2 verres max · Limit exceeded')
        ).toBeInTheDocument();
    });

    it('counts the days clear of an abstinence and records a slip', async () => {
        const onLog = renderCard({
            habit: habit({
                goal: goal({
                    goal_type: 'COUNT',
                    direction: 'AT_MOST',
                    target_minor: 0,
                }),
                status: {
                    date: '2026-10-05',
                    evaluation: evaluation({ target_minor: 0 }),
                    streak: { current: 12, best: 20 },
                },
            }),
        });
        expect(screen.getByText('12 days clear')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Record a slip for Lire' })
        );
        await waitFor(() => expect(onLog).toHaveBeenCalled());
        expect(onLog.mock.calls[0][1]).toBe(1);
    });

    it('offers no action while paused', () => {
        renderCard({
            habit: habit({
                status: {
                    date: '2026-10-05',
                    evaluation: evaluation({ is_paused: true }),
                    streak: null,
                },
            }),
        });
        expect(screen.getByText('Paused')).toBeInTheDocument();
        expect(screen.queryByRole('button')).toBeNull();
    });
});

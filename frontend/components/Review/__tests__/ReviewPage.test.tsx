import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ReviewPage from '../ReviewPage';
import * as reviewService from '../../../utils/reviewService';

jest.mock('../../../utils/reviewService', () => ({
    fetchReviewSummary: jest.fn(),
    fetchReviewCategory: jest.fn(),
    fetchReviewWeek: jest.fn(),
    decideTask: jest.fn(),
    keepProject: jest.fn(),
    saveWeekCapacity: jest.fn(),
    fetchWeeklyRoutine: jest.fn(),
    createWeeklyRoutine: jest.fn(),
    isParked: () => false,
}));
jest.mock('../../../utils/tasksService', () => ({ createTask: jest.fn() }));
jest.mock('../../../utils/inboxService', () => ({
    deleteInboxItem: jest.fn(),
    processInboxItem: jest.fn(),
}));
jest.mock('../../../utils/dailyPlanService', () => ({
    fetchDailyPlan: jest.fn(),
    saveDailyPlanItems: jest.fn(),
    toPlanItemInputs: (items: unknown[]) => items,
}));
jest.mock('../../../utils/projectsService', () => ({
    updateProject: jest.fn(),
}));
const mockToast = { showSuccessToast: jest.fn(), showErrorToast: jest.fn() };
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => mockToast,
}));
jest.mock('../../../hooks/useUiDensity', () => ({ useIsMinimal: () => true }));
const mockOpenTask = jest.fn();
jest.mock('../../../contexts/TaskPaneContext', () => ({
    useTaskPane: () => ({ openTask: mockOpenTask }),
}));
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: jest.fn(),
}));
const mockT = (
    key: string,
    fallback?: string,
    opts?: Record<string, unknown>
) =>
    (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name) =>
        String(opts?.[name] ?? '')
    );
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

const mocked = reviewService as jest.Mocked<typeof reviewService>;

const summary = {
    counts: {
        pushed: 1,
        undecided: 0,
        later: 0,
        review_due: 0,
        projects: 0,
        stale: 0,
    },
    attention_total: 1,
    decided_this_week: 2,
    week_start: '2026-10-26',
};

const pushed = {
    total: 1,
    items: [
        {
            task: {
                uid: 't1',
                name: 'Test app X',
                status: 'not_started',
                Project: { name: 'Apps' },
            },
            push: {
                recent_count: 6,
                total_count: 7,
                last_postponed_on: '2026-10-28',
                last_planned_for: '2026-10-28',
                frequent: true,
            },
        },
    ],
};

describe('ReviewPage', () => {
    beforeEach(() => {
        localStorage.setItem('review.step', 'pushed');
        mocked.fetchReviewSummary.mockResolvedValue(summary as any);
        mocked.fetchReviewCategory.mockResolvedValue(pushed as any);
        mocked.decideTask.mockResolvedValue({} as any);
        mocked.fetchWeeklyRoutine.mockResolvedValue(true);
    });

    afterEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    const renderPage = () =>
        render(
            <MemoryRouter>
                <ReviewPage />
            </MemoryRouter>
        );

    it('lists frequently moved tasks with a neutral count and no score', async () => {
        renderPage();
        expect(await screen.findByText('Test app X')).toBeInTheDocument();
        expect(screen.getByText(/Apps · moved 6 times/)).toBeInTheDocument();
        expect(
            screen.getByText(/1 to look at · 2 decided this week/)
        ).toBeInTheDocument();
        expect(mocked.fetchReviewCategory).toHaveBeenCalledWith(
            'pushed',
            0,
            50
        );
    });

    it('keeps a task as it is and takes it off the list', async () => {
        renderPage();
        await screen.findByText('Test app X');
        fireEvent.click(screen.getByRole('button', { name: /Decide/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Keep as is' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                reviewed: true,
            })
        );
        await waitFor(() =>
            expect(screen.queryByText('Test app X')).not.toBeInTheDocument()
        );
    });

    it('parks a task for later', async () => {
        renderPage();
        await screen.findByText('Test app X');
        fireEvent.click(screen.getByRole('button', { name: /Decide/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Later' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                later: true,
                reviewed: true,
            })
        );
    });

    it('opens the task from its title and remembers the step', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('Test app X'));
        expect(mockOpenTask).toHaveBeenCalledWith('t1');
        fireEvent.click(screen.getByRole('tab', { name: /Stalled projects/ }));
        expect(localStorage.getItem('review.step')).toBe('projects');
    });

    describe('weekly review routine', () => {
        const offer = () =>
            screen.queryByRole('button', {
                name: 'Plan a weekly review on Fridays',
            });

        it('offers one quiet button when no routine exists', async () => {
            mocked.fetchWeeklyRoutine.mockResolvedValue(false);
            renderPage();

            expect(await screen.findByText('Test app X')).toBeInTheDocument();
            expect(
                await screen.findByRole('button', {
                    name: 'Plan a weekly review on Fridays',
                })
            ).toBeInTheDocument();
        });

        it('stays out of the way when a routine exists', async () => {
            mocked.fetchWeeklyRoutine.mockResolvedValue(true);
            renderPage();

            await screen.findByText('Test app X');
            await waitFor(() =>
                expect(mocked.fetchWeeklyRoutine).toHaveBeenCalled()
            );
            expect(offer()).toBeNull();
        });

        it('creates the routine once and then hides the button', async () => {
            mocked.fetchWeeklyRoutine.mockResolvedValue(false);
            mocked.createWeeklyRoutine.mockResolvedValue(undefined);
            renderPage();

            fireEvent.click(
                await screen.findByRole('button', {
                    name: 'Plan a weekly review on Fridays',
                })
            );

            await waitFor(() =>
                expect(mocked.createWeeklyRoutine).toHaveBeenCalledWith(
                    'Weekly review'
                )
            );
            await waitFor(() => expect(offer()).toBeNull());
            expect(mockToast.showSuccessToast).toHaveBeenCalled();
        });

        it('keeps the button when the routine could not be created', async () => {
            mocked.fetchWeeklyRoutine.mockResolvedValue(false);
            mocked.createWeeklyRoutine.mockRejectedValue(new Error('boom'));
            renderPage();

            fireEvent.click(
                await screen.findByRole('button', {
                    name: 'Plan a weekly review on Fridays',
                })
            );

            await waitFor(() =>
                expect(mockToast.showErrorToast).toHaveBeenCalled()
            );
            expect(offer()).toBeInTheDocument();
        });
    });
});

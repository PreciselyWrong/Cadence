import React from 'react';
import {
    act,
    render,
    screen,
    fireEvent,
    waitFor,
} from '@testing-library/react';
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
const mockLinks = {
    links: [
        {
            uid: 'l1',
            url: 'https://github.com/pbakaus/impeccable',
            domain: 'github.com',
            title: 'Impeccable',
            description: 'Design skills for AI agents',
            kind: 'repo',
            github_stars: 1200,
            github_language: null,
            image_url: null,
            note: null,
            source_type: 'task',
            source_uid: 'l-task',
        },
    ],
    load: jest.fn(),
    save: jest.fn(),
};
jest.mock('../../../store/linksStore', () => ({
    useLinksStore: (pick: (s: unknown) => unknown) => pick(mockLinks),
}));
const mockToast = {
    showSuccessToast: jest.fn(),
    showErrorToast: jest.fn(),
    showUndoToast: jest.fn(),
};
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
        // Calm header: what needs a look, never a count of decisions.
        expect(
            screen.getByText('1 thing to look at, at your own pace')
        ).toBeInTheDocument();
        expect(screen.queryByText(/decided this week/)).not.toBeInTheDocument();
        expect(mocked.fetchReviewCategory).toHaveBeenCalledWith(
            'pushed',
            0,
            50
        );
    });

    it('keeps a task as it is and takes it off the list', async () => {
        renderPage();
        await screen.findByText('Test app X');
        fireEvent.click(screen.getByRole('button', { name: 'Keep as is' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                reviewed: true,
            })
        );
        await waitFor(() =>
            expect(screen.queryByText('Test app X')).not.toBeInTheDocument()
        );
    });

    it('takes the row off at once and puts it back if the save fails', async () => {
        let fail: (error: Error) => void = () => undefined;
        mocked.decideTask.mockImplementation(
            () => new Promise((_resolve, reject) => (fail = reject))
        );
        renderPage();
        await screen.findByText('Test app X');
        fireEvent.click(screen.getByRole('button', { name: 'Keep as is' }));
        // Gone before the server answers
        expect(screen.queryByText('Test app X')).not.toBeInTheDocument();

        fail(new Error('offline'));
        expect(await screen.findByText('Test app X')).toBeInTheDocument();
        expect(mockToast.showErrorToast).toHaveBeenCalled();
    });

    it('parks a task for later', async () => {
        renderPage();
        await screen.findByText('Test app X');
        fireEvent.click(screen.getByRole('button', { name: 'Later' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                later: true,
                reviewed: true,
            })
        );
    });

    it('offers the common choices as chips and keeps the rest behind More', async () => {
        renderPage();
        await screen.findByText('Test app X');

        expect(screen.queryByRole('button', { name: /Decide/ })).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Do today' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Drop' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'More…' }));
        expect(
            screen.getByRole('button', { name: 'Drop' })
        ).toBeInTheDocument();
    });

    it('offers Undo after a decision and restores what it changed', async () => {
        renderPage();
        await screen.findByText('Test app X');
        fireEvent.click(screen.getByRole('button', { name: 'Later' }));
        await waitFor(() => expect(mocked.decideTask).toHaveBeenCalledTimes(1));

        expect(mockToast.showUndoToast).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Function)
        );
        const [, undo] = mockToast.showUndoToast.mock.calls[0];
        act(() => undo());

        expect(await screen.findByText('Test app X')).toBeInTheDocument();
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenLastCalledWith('t1', {
                in_view: false,
                week_of: null,
                review_on: null,
                later: false,
            })
        );
    });

    it('sorts Later one task at a time and passes a skipped one to the end', async () => {
        localStorage.setItem('review.step', 'later');
        mocked.fetchReviewCategory.mockResolvedValue({
            total: 2,
            items: [
                {
                    task: {
                        uid: 'a',
                        name: 'First parked',
                        status: 'not_started',
                    },
                    review_due: false,
                    last_activity_at: '2026-09-01T00:00:00Z',
                },
                {
                    task: {
                        uid: 'b',
                        name: 'Second parked',
                        status: 'not_started',
                    },
                    review_due: false,
                    last_activity_at: '2026-09-02T00:00:00Z',
                },
            ],
        } as any);
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Sort one by one' })
        );

        expect(screen.getByText('First parked')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
        expect(screen.getByText('Second parked')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Do today' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('b', {
                today: true,
                later: false,
                reviewed: true,
            })
        );
        expect(await screen.findByText('First parked')).toBeInTheDocument();
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

    describe('Later', () => {
        const parked = (
            uid: string,
            name: string,
            project: string | null,
            touched: string
        ) => ({
            task: {
                uid,
                name,
                status: 'not_started',
                Project: project ? { uid: project, name: project } : undefined,
            },
            review_due: false,
            last_activity_at: touched,
        });

        beforeEach(() => {
            localStorage.setItem('review.step', 'later');
            mocked.fetchReviewCategory.mockResolvedValue({
                total: 3,
                items: [
                    parked(
                        'a',
                        'Fix the gate',
                        'House',
                        '2026-09-01T00:00:00Z'
                    ),
                    parked(
                        'l-task',
                        'https://github.com/pbakaus/impeccable',
                        null,
                        '2026-10-30T00:00:00Z'
                    ),
                    parked(
                        'b',
                        'Paint the shed',
                        'House',
                        '2026-10-01T00:00:00Z'
                    ),
                ],
            } as any);
        });

        it('groups parked tasks by project and shows a link as its page, not its address', async () => {
            renderPage();
            expect(
                await screen.findByRole('button', { name: /House\s*2/ })
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: /No project\s*1/ })
            ).toBeInTheDocument();
            expect(screen.getByText('Impeccable')).toBeInTheDocument();
            expect(
                screen.queryByText('https://github.com/pbakaus/impeccable')
            ).not.toBeInTheDocument();
            expect(mocked.fetchReviewCategory).toHaveBeenCalledWith(
                'later',
                0,
                200
            );
        });

        it('filters the backlog and folds a group', async () => {
            renderPage();
            await screen.findByText('Fix the gate');
            fireEvent.change(screen.getByLabelText('Filter'), {
                target: { value: 'shed' },
            });
            expect(screen.queryByText('Fix the gate')).not.toBeInTheDocument();
            expect(screen.getByText('Paint the shed')).toBeInTheDocument();
            fireEvent.change(screen.getByLabelText('Filter'), {
                target: { value: '' },
            });
            fireEvent.click(screen.getByRole('button', { name: /House\s*2/ }));
            expect(
                screen.queryByText('Paint the shed')
            ).not.toBeInTheDocument();
        });

        it('takes a parked task out of Later when it is done today', async () => {
            renderPage();
            await screen.findByText('Fix the gate');
            fireEvent.click(
                screen.getAllByRole('button', { name: 'Do today' })[0]
            );
            await waitFor(() =>
                expect(mocked.decideTask).toHaveBeenCalledWith('b', {
                    today: true,
                    later: false,
                    reviewed: true,
                })
            );
        });
    });

    it('shows no backlog count on Later, only reviews that came due', async () => {
        mocked.fetchReviewSummary.mockResolvedValue({
            ...summary,
            counts: { ...summary.counts, later: 133, review_due: 2 },
        } as any);
        renderPage();
        const tab = await screen.findByRole('tab', { name: /Later/ });
        await waitFor(() => expect(tab).toHaveTextContent('Later2'));
        expect(tab).not.toHaveTextContent('133');
    });

    describe('quick review', () => {
        const lists: Record<string, unknown[]> = {
            undecided: [
                {
                    uid: 'i1',
                    title: null,
                    content: 'Shared shopping list',
                    created_at: '2026-10-30T00:00:00Z',
                },
            ],
            pushed: pushed.items,
            projects: [],
            stale: [],
            later: [
                {
                    task: {
                        uid: 'l1',
                        name: 'Learn to juggle',
                        status: 'not_started',
                        reviewed_at: null,
                    },
                    review_due: false,
                    last_activity_at: '2026-05-01T00:00:00Z',
                },
            ],
        };

        beforeEach(() => {
            mocked.fetchReviewCategory.mockImplementation(
                async (category: string) =>
                    ({
                        total: (lists[category] || []).length,
                        items: lists[category] || [],
                    }) as any
            );
        });

        it('goes through one thing at a time, with gentle progress', async () => {
            renderPage();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Start' })
            );
            expect(
                await screen.findByText('Shared shopping list')
            ).toBeInTheDocument();
            expect(screen.getByText('1 of 3')).toBeInTheDocument();
            expect(screen.queryByText('Test app X')).not.toBeInTheDocument();
            expect(mocked.fetchReviewCategory).toHaveBeenCalledWith(
                'later',
                0,
                200
            );

            fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
            expect(await screen.findByText('Test app X')).toBeInTheDocument();
            expect(screen.getByText('2 of 3')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: /Keep as is/ }));
            await waitFor(() =>
                expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                    reviewed: true,
                })
            );
            // A parked idea offers "Keep parked" at once, so it rotates out.
            expect(
                await screen.findByText('Learn to juggle')
            ).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: /Keep parked/ })
            );
            await waitFor(() =>
                expect(mocked.decideTask).toHaveBeenCalledWith('l1', {
                    review_on: null,
                    reviewed: true,
                })
            );
            expect(
                await screen.findByText("That's it for now.")
            ).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Back to the review' })
            );
            expect(
                await screen.findByRole('button', { name: 'Start' })
            ).toBeInTheDocument();
        });

        it('answers the keyboard: a number chooses, S skips, Escape stops', async () => {
            renderPage();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Start' })
            );
            await screen.findByText('Shared shopping list');
            fireEvent.keyDown(window, { key: 's' });
            expect(await screen.findByText('Test app X')).toBeInTheDocument();
            // Pushed back: 1 = Do today
            fireEvent.keyDown(window, { key: '1' });
            await waitFor(() =>
                expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                    today: true,
                    reviewed: true,
                })
            );
            expect(
                await screen.findByText('Learn to juggle')
            ).toBeInTheDocument();
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(
                await screen.findByRole('button', { name: 'Start' })
            ).toBeInTheDocument();
        });

        it('says so calmly when there is nothing to look at', async () => {
            mocked.fetchReviewSummary.mockResolvedValue({
                ...summary,
                counts: { ...summary.counts, pushed: 0 },
                attention_total: 0,
            } as any);
            Object.keys(lists).forEach((key) => (lists[key] = []));
            renderPage();
            expect(
                await screen.findByText('All up to date')
            ).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Start' }));
            expect(
                await screen.findByText('Nothing needs a look right now.')
            ).toBeInTheDocument();
        });
    });
});

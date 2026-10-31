import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GoalDetails from '../GoalDetails';
import { createGoal, fetchGoalByUid } from '../../../utils/goalsService';
import { Goal } from '../../../entities/Goal';

// A stable t: the page reloads the goal whenever t changes.
const mockT = (
    key: string,
    fallback?: any,
    values?: Record<string, string | number>
) =>
    (typeof fallback === 'string' ? fallback : key).replace(
        /{{(\w+)}}/g,
        (_m, name) => String(values?.[name] ?? '')
    );
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }),
}));
jest.mock('../../../utils/goalsService', () => ({
    fetchGoalByUid: jest.fn(),
    createGoal: jest.fn(),
    deleteGoal: jest.fn(),
    updateGoal: jest.fn(),
}));
jest.mock('../../../utils/projectsService', () => ({
    fetchProjects: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));
jest.mock('../../Task/TaskList', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../Project/ProjectItem', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../Project/useProjectCardActions', () => ({
    __esModule: true,
    default: () => ({ cardActions: {}, modals: null }),
}));
jest.mock('../../Shared/ShareModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../GoalModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../GoalHero', () => ({
    __esModule: true,
    default: (props: any) => (
        <div data-testid="hero">
            {props.doneCount}/{props.totalCount}
        </div>
    ),
}));
jest.mock('../../../store/useStore', () => {
    const state = {
        goalsStore: { loadGoals: jest.fn() },
        projectsStore: { projects: [] },
    };
    const useStore: any = (selector: any) => selector(state);
    useStore.getState = () => state;
    return { useStore };
});

const objective: Goal = {
    uid: 'obj00001',
    title: 'Launch the business',
    horizon: 'year',
    status: 'active',
    progress: { done: 2, total: 4, percent: 50 },
    KeyResults: [
        {
            uid: 'kr000001',
            title: 'Sign 3 clients',
            horizon: 'year',
            status: 'active',
            progress: { done: 1, total: 4, percent: 25 },
        },
        {
            uid: 'kr000002',
            title: 'Open the bank account',
            horizon: 'year',
            status: 'active',
            progress: { done: 0, total: 0, percent: null },
        },
    ],
    Tasks: [],
    Projects: [],
};

const renderPage = (goal: Goal) => {
    (fetchGoalByUid as jest.Mock).mockResolvedValue(goal);
    return render(
        <MemoryRouter initialEntries={[`/goal/${goal.uid}-x`]}>
            <Routes>
                <Route path="/goal/:uidSlug" element={<GoalDetails />} />
            </Routes>
        </MemoryRouter>
    );
};

describe('GoalDetails key results', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lists the key results under the objective with their progress', async () => {
        renderPage(objective);

        const section = await screen.findByTestId('key-results');
        expect(section).toHaveTextContent('Sign 3 clients');
        expect(section).toHaveTextContent('1 of 4 done');
        expect(section).toHaveTextContent('Open the bank account');
        expect(
            screen.getByRole('link', { name: /Sign 3 clients/ })
        ).toHaveAttribute('href', expect.stringContaining('/goal/kr000001'));
    });

    it("feeds the hero with the whole objective's progress", async () => {
        renderPage(objective);

        expect(await screen.findByTestId('hero')).toHaveTextContent('2/4');
    });

    it('adds a key result from a quiet inline field', async () => {
        (createGoal as jest.Mock).mockResolvedValue({
            goal: { uid: 'kr000003' },
        });
        renderPage({ ...objective, KeyResults: [] });

        fireEvent.click(
            await screen.findByRole('button', { name: 'Add a key result' })
        );
        const input = screen.getByPlaceholderText('Key result');
        fireEvent.change(input, { target: { value: 'Ship the website' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(createGoal).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Ship the website',
                    parent_goal_uid: 'obj00001',
                })
            )
        );
        await waitFor(() => expect(fetchGoalByUid).toHaveBeenCalledTimes(2));
    });

    it('offers no key results on a key result and links back to its objective', async () => {
        renderPage({
            uid: 'kr000001',
            title: 'Sign 3 clients',
            horizon: 'year',
            status: 'active',
            parent_goal_uid: 'obj00001',
            parent_goal: { uid: 'obj00001', title: 'Launch the business' },
            KeyResults: [],
            progress: { done: 0, total: 0, percent: null },
        });

        expect(
            await screen.findByRole('link', { name: /Launch the business/ })
        ).toHaveAttribute('href', expect.stringContaining('/goal/obj00001'));
        expect(
            screen.queryByRole('button', { name: 'Add a key result' })
        ).toBeNull();
        expect(screen.queryByTestId('key-results')).toBeNull();
    });

    it('keeps a simple goal simple: only the quiet add link', async () => {
        renderPage({ ...objective, KeyResults: [] });

        await screen.findByTestId('hero');
        expect(screen.queryByTestId('key-results')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Add a key result' })
        ).toBeInTheDocument();
    });

    it('offers no key results on a bucket-list goal', async () => {
        renderPage({ ...objective, KeyResults: [], bucket: 'do' });

        await screen.findByTestId('hero');
        expect(
            screen.queryByRole('button', { name: 'Add a key result' })
        ).toBeNull();
    });
});

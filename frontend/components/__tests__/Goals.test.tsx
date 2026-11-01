import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Goals from '../Goals';
import { ToastProvider } from '../Shared/ToastContext';
import { Goal } from '../../entities/Goal';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
        i18n: { language: 'en' },
    }),
}));
jest.mock('../../hooks/useCan', () => ({ useCan: () => true }));
const mockModal = jest.fn();
jest.mock('../Goal/GoalModal', () => ({
    __esModule: true,
    default: (props: any) => {
        mockModal(props);
        return null;
    },
}));
const mockCreateGoal = jest.fn();
const mockUpdateGoal = jest.fn();
jest.mock('../../utils/goalsService', () => ({
    createGoal: (...args: unknown[]) => mockCreateGoal(...args),
    updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
}));
const mockUpdateTask = jest.fn();
jest.mock('../../utils/tasksService', () => ({
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
}));

const mockOpenCapture = jest.fn();
jest.mock('../../utils/captureUi', () => ({
    openCapture: (...args: unknown[]) => mockOpenCapture(...args),
    onCaptureSaved: () => () => undefined,
}));

let mockGoals: Partial<Goal>[] = [];
jest.mock('../../store/useStore', () => {
    const state = () => ({
        goalsStore: {
            goals: mockGoals,
            isLoading: false,
            hasLoaded: true,
            loadGoals: jest.fn(),
            setGoals: jest.fn(),
        },
        areasStore: { areas: [], hasLoaded: true, loadAreas: jest.fn() },
    });
    const useStore: any = (selector: any) => selector(state());
    useStore.getState = state;
    return { useStore };
});

const goal = (overrides: Partial<Goal>): Partial<Goal> => ({
    status: 'active',
    horizon: 'season',
    ...overrides,
});

const renderGoals = () =>
    render(
        <ToastProvider>
            <MemoryRouter>
                <Goals />
            </MemoryRouter>
        </ToastProvider>
    );

const openGroup = (name: string) =>
    fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${name}`) })
    );

describe('Goals page: one screen for objectives and the wish list', () => {
    beforeEach(() => {
        mockModal.mockClear();
        mockOpenCapture.mockClear();
        mockCreateGoal.mockReset().mockResolvedValue({});
        mockUpdateGoal.mockReset().mockResolvedValue({});
        mockUpdateTask.mockReset().mockResolvedValue({});
        mockGoals = [
            goal({
                id: 1,
                uid: 'o1',
                title: 'Launch the business',
                progress: { done: 1, total: 4, percent: 25 },
                next_task: { uid: 't1', name: 'Call Anna', due_date: null },
            }),
            goal({
                uid: 'k1',
                title: 'Sign 3 clients',
                parent_goal_uid: 'o1',
                progress: { done: 1, total: 3, percent: 33 },
            }),
            goal({ uid: 'p1', title: 'Learn Japanese', status: 'paused' }),
            goal({ uid: 'b1', title: 'Own a house', bucket: 'have' }),
            goal({ uid: 'b2', title: 'Be a calm person', bucket: 'be' }),
            goal({ uid: 'b3', title: 'See the northern lights', bucket: 'do' }),
            goal({
                uid: 'b4',
                title: 'Write a book',
                bucket: 'do',
                status: 'achieved',
            }),
        ];
    });

    it('shows each active objective with its progress, next step and key results', () => {
        renderGoals();

        const card = screen.getByTestId('objective-card');
        expect(
            within(card).getByText('Launch the business')
        ).toBeInTheDocument();
        expect(within(card).getByText('25 %')).toBeInTheDocument();
        expect(within(card).getByText('Call Anna')).toBeInTheDocument();
        expect(within(card).getByText('Sign 3 clients')).toBeInTheDocument();
        expect(within(card).getByText('1/3')).toBeInTheDocument();
        // The paused objective waits in a folded group.
        expect(screen.queryByText('Learn Japanese')).toBeNull();
        openGroup('Paused, achieved or dropped');
        expect(screen.getByText('Learn Japanese')).toBeInTheDocument();
    });

    it('finishes the next step from the card', async () => {
        renderGoals();

        fireEvent.click(
            screen.getByRole('button', { name: 'goals.overview.completeStep' })
        );

        await waitFor(() =>
            expect(mockUpdateTask).toHaveBeenCalledWith('t1', { status: 2 })
        );
    });

    it('folds the wish list into Have, Be and Do, finished wishes apart', () => {
        renderGoals();

        expect(screen.queryByText('Own a house')).toBeNull();
        for (const [group, title] of [
            ['Have', 'Own a house'],
            ['Be', 'Be a calm person'],
            ['Do', 'See the northern lights'],
        ]) {
            openGroup(group);
            const section = screen.getByRole('region', { name: group });
            expect(within(section).getByText(title)).toBeInTheDocument();
        }
        expect(screen.queryByText('Write a book')).toBeNull();
        openGroup('Fulfilled');
        expect(screen.getByText('Write a book')).toBeInTheDocument();
    });

    it('adds a wish straight into an open group and keeps the field ready', async () => {
        renderGoals();
        openGroup('Be');

        const field = screen.getByTestId('bucket-add-be');
        fireEvent.change(field, { target: { value: '  Patient  ' } });
        fireEvent.submit(field);

        await waitFor(() =>
            expect(mockCreateGoal).toHaveBeenCalledWith({
                title: 'Patient',
                bucket: 'be',
                horizon: 'season',
                status: 'active',
            })
        );
        await waitFor(() => expect(field).toHaveValue(''));
    });

    it('marks a wish fulfilled in one tap', async () => {
        renderGoals();
        openGroup('Have');

        fireEvent.click(
            screen.getByRole('button', { name: 'goals.overview.markDone' })
        );

        await waitFor(() =>
            expect(mockUpdateGoal).toHaveBeenCalledWith('b1', {
                status: 'achieved',
            })
        );
    });

    it('turns a wish into a task linked to it, and keeps the wish', () => {
        mockGoals = [
            goal({ id: 9, uid: 'b1', title: 'Own a house', bucket: 'have' }),
        ];
        renderGoals();
        openGroup('Have');

        fireEvent.click(
            screen.getByRole('button', { name: 'goals.overview.createTaskFor' })
        );

        expect(mockOpenCapture).toHaveBeenCalledWith(
            'task',
            null,
            'Own a house',
            null,
            { id: 9, uid: 'b1', title: 'Own a house' }
        );
        expect(screen.getByText('Own a house')).toBeInTheDocument();
    });

    it('searches titles without accents and opens the matching groups', () => {
        mockGoals = [
            ...mockGoals,
            goal({ uid: 'b5', title: 'Écrire un roman', bucket: 'do' }),
        ];
        renderGoals();

        fireEvent.change(
            screen.getByRole('searchbox', { name: 'Search a goal or a wish' }),
            { target: { value: 'ecrire' } }
        );

        expect(screen.getByText('Écrire un roman')).toBeInTheDocument();
        expect(screen.queryByText('Launch the business')).toBeNull();
        expect(screen.queryByText('See the northern lights')).toBeNull();
    });

    it('opens the goal form from the New Goal button', () => {
        renderGoals();

        fireEvent.click(screen.getByTestId('new-goal-button'));

        const last = mockModal.mock.calls[mockModal.mock.calls.length - 1][0];
        expect(last.isOpen).toBe(true);
    });
});

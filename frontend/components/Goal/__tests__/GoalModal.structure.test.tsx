import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import GoalModal from '../GoalModal';
import { createGoal } from '../../../utils/goalsService';
import { Goal } from '../../../entities/Goal';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));
jest.mock('../../../utils/goalsService', () => ({
    createGoal: jest.fn(),
    updateGoal: jest.fn(),
}));

let mockGoals: Partial<Goal>[] = [];
jest.mock('../../../store/useStore', () => {
    const state = () => ({
        areasStore: { areas: [] },
        goalsStore: {
            goals: mockGoals,
            loadGoals: jest.fn(),
            setGoals: jest.fn(),
        },
    });
    const useStore: any = (selector: (s: any) => any) => selector(state());
    useStore.getState = state;
    return { useStore };
});

const renderPanel = (props: Partial<React.ComponentProps<typeof GoalModal>>) =>
    render(
        <MemoryRouter>
            <GoalModal isOpen onClose={jest.fn()} {...props} />
        </MemoryRouter>
    );

const type = (title: string) =>
    fireEvent.change(screen.getByTestId('goal-title-input'), {
        target: { value: title },
    });

describe('GoalModal horizons, key results and bucket list', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGoals = [];
        (createGoal as jest.Mock).mockResolvedValue({
            goal: { uid: 'g-new', title: 'New' },
        });
    });

    it('offers month, quarter, season and year', () => {
        renderPanel({});

        const horizon = screen.getByLabelText('Horizon');
        const options = Array.from(horizon.querySelectorAll('option')).map(
            (o) => o.getAttribute('value')
        );
        expect(options).toEqual(['month', 'quarter', 'season', 'year']);
    });

    it('offers only top-level goals as the objective of a key result', () => {
        mockGoals = [
            { uid: 'o1', title: 'Launch the business', status: 'active' },
            {
                uid: 'k1',
                title: 'Already a key result',
                parent_goal_uid: 'o1',
            },
            { uid: 'b1', title: 'Climb Kilimanjaro', bucket: 'do' },
        ] as Partial<Goal>[];
        renderPanel({});

        const parent = screen.getByLabelText('Key result of');
        const labels = Array.from(parent.querySelectorAll('option')).map(
            (o) => o.textContent
        );
        expect(labels).toEqual(['None (stands alone)', 'Launch the business']);
    });

    it('creates a key result under the chosen objective', async () => {
        mockGoals = [{ uid: 'o1', title: 'Launch the business' }];
        renderPanel({});

        type('Sign 3 clients');
        fireEvent.change(screen.getByLabelText('Key result of'), {
            target: { value: 'o1' },
        });
        fireEvent.click(screen.getByTestId('goal-save-button'));

        await waitFor(() =>
            expect(createGoal).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Sign 3 clients',
                    parent_goal_uid: 'o1',
                })
            )
        );
    });

    it('hides the objective choice for a goal that has key results', () => {
        mockGoals = [{ uid: 'o1', title: 'Objective' }];
        renderPanel({
            goal: {
                uid: 'o2',
                title: 'Has key results',
                horizon: 'year',
                status: 'active',
                key_results_count: 2,
            } as Goal,
        });

        expect(screen.queryByLabelText('Key result of')).toBeNull();
    });

    it('creates a bucket-list goal without a horizon or a date', async () => {
        renderPanel({ defaultBucket: 'be' });

        expect(screen.queryByLabelText('Horizon')).toBeNull();
        expect(screen.queryByLabelText('Key result of')).toBeNull();
        expect(screen.getByLabelText('Bucket list group')).toHaveValue('be');

        type('Be someone who reads daily');
        fireEvent.click(screen.getByTestId('goal-save-button'));

        await waitFor(() => expect(createGoal).toHaveBeenCalled());
        const payload = (createGoal as jest.Mock).mock.calls[0][0];
        expect(payload).toMatchObject({
            title: 'Be someone who reads daily',
            bucket: 'be',
            target_date: null,
        });
        expect(payload.parent_goal_uid ?? null).toBeNull();
    });

    it('takes a goal off the bucket list with the empty choice', () => {
        renderPanel({ defaultBucket: 'do' });

        fireEvent.change(screen.getByLabelText('Bucket list group'), {
            target: { value: '' },
        });

        expect(screen.getByLabelText('Horizon')).toBeInTheDocument();
    });
});

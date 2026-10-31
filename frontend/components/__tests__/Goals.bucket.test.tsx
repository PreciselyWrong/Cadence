import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
jest.mock('../Shared/ConfirmDialog', () => ({
    __esModule: true,
    default: () => null,
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

describe('Goals page: bucket list and key results', () => {
    beforeEach(() => {
        mockModal.mockClear();
        mockGoals = [
            goal({ uid: 'o1', title: 'Launch the business' }),
            goal({
                uid: 'k1',
                title: 'Sign 3 clients',
                parent_goal_uid: 'o1',
            }),
            goal({ uid: 'b1', title: 'Own a house', bucket: 'have' }),
            goal({ uid: 'b2', title: 'Be a calm person', bucket: 'be' }),
            goal({ uid: 'b3', title: 'See the northern lights', bucket: 'do' }),
        ];
    });

    it('lists objectives only, not key results or bucket-list goals', () => {
        renderGoals();

        expect(screen.getByText('Launch the business')).toBeInTheDocument();
        expect(screen.queryByText('Sign 3 clients')).toBeNull();
        expect(screen.queryByText('Own a house')).toBeNull();
    });

    it('groups the bucket list under Have, Be and Do', () => {
        renderGoals();

        fireEvent.click(screen.getByRole('tab', { name: 'Bucket list' }));

        for (const [group, title] of [
            ['Have', 'Own a house'],
            ['Be', 'Be a calm person'],
            ['Do', 'See the northern lights'],
        ]) {
            const section = screen.getByRole('region', { name: group });
            expect(within(section).getByText(title)).toBeInTheDocument();
        }
        expect(screen.queryByText('Launch the business')).toBeNull();
    });

    it('adds a goal straight into a group', () => {
        renderGoals();
        fireEvent.click(screen.getByRole('tab', { name: 'Bucket list' }));

        fireEvent.click(screen.getByTestId('bucket-add-be'));

        const last = mockModal.mock.calls[mockModal.mock.calls.length - 1][0];
        expect(last.isOpen).toBe(true);
        expect(last.defaultBucket).toBe('be');
    });

    it('opens the regular goal form from the New Goal button on the Goals tab', () => {
        renderGoals();

        fireEvent.click(screen.getByTestId('new-goal-button'));

        const last = mockModal.mock.calls[mockModal.mock.calls.length - 1][0];
        expect(last.isOpen).toBe(true);
        expect(last.defaultBucket ?? null).toBeNull();
    });

    it('shows no date or horizon on a bucket-list goal', () => {
        mockGoals = [
            goal({
                uid: 'b1',
                title: 'Own a house',
                bucket: 'have',
                horizon: 'year',
            }),
        ];
        renderGoals();
        fireEvent.click(screen.getByRole('tab', { name: 'Bucket list' }));

        expect(screen.queryByText('year')).toBeNull();
        expect(screen.queryByText('Year')).toBeNull();
    });
});

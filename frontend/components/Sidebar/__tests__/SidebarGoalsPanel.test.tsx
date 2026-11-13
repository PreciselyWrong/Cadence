import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarGoalsPanel from '../SidebarGoalsPanel';
import { Goal } from '../../../entities/Goal';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            const text =
                typeof fallback === 'string'
                    ? fallback
                    : (fallback?.defaultValue ?? key);
            const values = typeof fallback === 'object' ? fallback : options;
            return text.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
                String(values?.[name] ?? '')
            );
        },
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../hooks/useCan', () => ({ useCan: () => true }));

let mockGoals: Goal[] = [];
jest.mock('../../../store/useStore', () => ({
    useStore: (selector: (state: any) => unknown) =>
        selector({
            goalsStore: {
                goals: mockGoals,
                hasLoaded: true,
                loadGoals: jest.fn(),
            },
        }),
}));

const location = {
    pathname: '/goals',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const renderPanel = (handleNavClick = jest.fn(), openGoalModal = jest.fn()) => {
    render(
        <SidebarGoalsPanel
            handleNavClick={handleNavClick}
            location={location}
            openGoalModal={openGoalModal}
        />
    );
    return { handleNavClick, openGoalModal };
};

describe('SidebarGoalsPanel', () => {
    beforeEach(() => {
        localStorage.clear();
        mockGoals = [
            {
                uid: 'run',
                title: 'Run a half marathon',
                horizon: 'season',
                status: 'active',
                target_date: `${new Date().getFullYear()}-12-31`,
                progress: { done: 1, total: 4, percent: 25 },
            },
            {
                uid: 'km',
                title: 'Run 20 km a week',
                horizon: 'season',
                status: 'active',
                parent_goal_uid: 'run',
                progress: { done: 0, total: 0, percent: null },
            },
            {
                uid: 'piano',
                title: 'Learn the piano',
                horizon: 'year',
                status: 'paused',
            },
            {
                uid: 'boat',
                title: 'A sailing boat',
                horizon: 'year',
                status: 'active',
                bucket: 'have',
            },
        ];
    });

    it('opens on the active goals, each with its progress bar and target date', () => {
        renderPanel();

        const active = screen.getByRole('group', { name: /Active/ });
        expect(
            within(active).getByText('Run a half marathon')
        ).toBeInTheDocument();
        const bars = within(active).getAllByRole('progressbar');
        expect(bars[0]).toHaveAttribute('aria-valuenow', '25');
        expect(bars[0]).toHaveAccessibleName('1 of 4 done');
        expect(within(active).getByText('Dec 31')).toBeInTheDocument();
        // Key results sit under their objective.
        expect(within(active).getByText('Run 20 km a week')).toBeVisible();
    });

    it('keeps the paused goals and the bucket list folded, with their counts', () => {
        renderPanel();

        const other = screen.getByRole('button', {
            name: /Paused, achieved or dropped/,
        });
        expect(other).toHaveAttribute('aria-expanded', 'false');
        expect(other).toHaveTextContent('1');
        expect(screen.queryByText('Learn the piano')).toBeNull();

        fireEvent.click(other);
        expect(screen.getByText('Learn the piano')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Have/ })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
    });

    it('opens a goal on a click', () => {
        const { handleNavClick } = renderPanel();

        fireEvent.click(
            screen.getByRole('button', { name: /Run a half marathon/ })
        );
        expect(handleNavClick).toHaveBeenCalledWith(
            '/goal/run-run-a-half-marathon',
            'Run a half marathon',
            expect.anything()
        );
    });

    it('offers a new goal, also when there is none', () => {
        mockGoals = [];
        const { openGoalModal } = renderPanel();

        expect(screen.getByText('No goals yet.')).toBeInTheDocument();
        const buttons = screen.getAllByRole('button', { name: 'New Goal' });
        fireEvent.click(buttons[buttons.length - 1]);
        expect(openGoalModal).toHaveBeenCalled();
    });
});

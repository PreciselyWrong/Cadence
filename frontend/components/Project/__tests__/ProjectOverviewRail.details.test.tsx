import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectOverviewRail from '../ProjectOverviewRail';
import { listShares } from '../../../utils/sharesService';

jest.mock('react-router-dom', () => ({
    Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
jest.mock('../../../store/useStore', () => ({
    useStore: () => ({
        tagsStore: { tags: [], hasLoaded: true, isLoading: false },
    }),
}));
jest.mock('../../../utils/sharesService', () => ({
    listShares: jest.fn(),
}));
jest.mock('../../../utils/peopleService', () => ({
    fetchAssignablePeopleForProject: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../utils/goalsService', () => ({
    fetchGoals: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../utils/projectShareCache', () => ({
    canManageProjectShares: () => true,
}));
// Pickers pull in i18n and date libraries the panel does not need here.
jest.mock('../../Shared/AreaDropdown', () => () => null);
jest.mock('../../Shared/GoalDropdown', () => () => null);
jest.mock('../../Shared/PriorityDropdown', () => () => null);
jest.mock('../../Shared/DatePicker', () => () => null);
jest.mock('../../Shared/DateTimePicker', () => () => null);
jest.mock('../../Shared/ColorPicker', () => () => null);
jest.mock('../../Tag/TagInput', () => () => null);

const t = ((key: string, fallback?: any, options?: any) =>
    typeof fallback === 'string'
        ? fallback.replace(
              /\{\{(\w+)\}\}/g,
              (_: string, name: string) => options?.[name] ?? ''
          )
        : key) as any;

const renderRail = (project: Record<string, unknown> = {}) =>
    render(
        <ProjectOverviewRail
            project={{ id: 1, uid: 'p1', name: 'House', ...project } as any}
            areas={[]}
            notes={[]}
            t={t}
            onUpdate={jest.fn()}
            onShareClick={jest.fn()}
            onCreateNote={jest.fn()}
            onOpenNote={jest.fn()}
        />
    );

describe('ProjectOverviewRail details', () => {
    beforeEach(() => {
        (listShares as jest.Mock).mockResolvedValue([]);
    });

    it('lists only the filled fields; the empty ones wait behind one button', () => {
        renderRail({ color: '#ff0000' });

        expect(screen.getByText('Color')).toBeInTheDocument();
        expect(screen.queryByText('Set area')).toBeNull();
        expect(screen.queryByText('Set priority')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Add a detail' }));

        expect(screen.getByText('Set area')).toBeInTheDocument();
        expect(screen.getByText('Set priority')).toBeInTheDocument();
    });

    it('drops the empty-state sentence of the notes panel', () => {
        renderRail();
        expect(screen.queryByText('No notes yet.')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Add note' })
        ).toBeInTheDocument();
    });
});

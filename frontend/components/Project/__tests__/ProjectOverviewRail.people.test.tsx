import React from 'react';
import { render, screen } from '@testing-library/react';
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

const owner = {
    user_id: 1,
    email: 'me@example.com',
    access_level: 'owner',
    is_owner: true,
};

const renderRail = () =>
    render(
        <ProjectOverviewRail
            project={{ id: 1, uid: 'p1', name: 'House' } as any}
            areas={[]}
            notes={[]}
            t={t}
            onUpdate={jest.fn()}
            onShareClick={jest.fn()}
            onCreateNote={jest.fn()}
            onOpenNote={jest.fn()}
        />
    );

describe('ProjectOverviewRail people', () => {
    it('shows no People panel for a project only its owner sees', async () => {
        (listShares as jest.Mock).mockResolvedValue([owner]);
        renderRail();

        expect(await screen.findByText('Project info')).toBeInTheDocument();
        await Promise.resolve();
        expect(screen.queryByText('People')).not.toBeInTheDocument();
        expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    });

    it('lists the members once the project is shared', async () => {
        (listShares as jest.Mock).mockResolvedValue([
            owner,
            {
                user_id: 2,
                email: 'ana@example.com',
                access_level: 'rw',
                status: 'accepted',
            },
        ]);
        renderRail();

        expect(await screen.findByText('People')).toBeInTheDocument();
        expect(screen.getByText('2 members')).toBeInTheDocument();
        expect(screen.getByText('Can edit')).toBeInTheDocument();
    });
});

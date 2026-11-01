import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarProjects from '../SidebarProjects';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => true,
}));

jest.mock('../../../hooks/useCan', () => ({
    useCan: () => true,
}));

jest.mock('../../../hooks/useSidebarSectionBadge', () => ({
    useSidebarSectionBadge: () => false,
}));

jest.mock('../../../hooks/useSidebarSectionExpanded', () => ({
    useSidebarSectionExpanded: () => [true, jest.fn()],
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const mockProjects = [
    { id: 1, uid: 'p1', name: 'Home', status: 'in_progress' },
    { id: 2, uid: 'p2', name: 'Parked idea', status: 'paused' },
    { id: 3, uid: 'p3', name: 'Old work', status: 'archived' },
    { id: 4, uid: 'p4', name: 'Dropped plan', status: 'cancelled' },
];

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            projectsStore: {
                projects: mockProjects,
                hasLoaded: true,
                loadProjects: jest.fn(),
            },
        }),
}));

describe('SidebarProjects and the stash', () => {
    it('lists only the projects still competing for attention', () => {
        render(
            <SidebarProjects
                handleNavClick={jest.fn()}
                location={
                    {
                        pathname: '/today',
                        search: '',
                        hash: '',
                        state: null,
                        key: 'k',
                    } as any
                }
                isDarkMode={false}
                openProjectModal={jest.fn()}
            />
        );

        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Parked idea')).not.toBeInTheDocument();
        expect(screen.queryByText('Old work')).not.toBeInTheDocument();
        expect(screen.queryByText('Dropped plan')).not.toBeInTheDocument();
    });
});

describe('SidebarProjects header controls', () => {
    it('names its expand toggle and shows its add button without hover', () => {
        render(
            <SidebarProjects
                handleNavClick={jest.fn()}
                location={
                    {
                        pathname: '/today',
                        search: '',
                        hash: '',
                        state: null,
                        key: 'k',
                    } as any
                }
                isDarkMode={false}
                openProjectModal={jest.fn()}
            />
        );
        const toggle = screen.getByRole('button', {
            name: 'Expand or collapse',
        });
        expect(toggle).toHaveAttribute('type', 'button');
        const add = screen.getByRole('button', { name: 'Add Project' });
        expect(add.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    });
});

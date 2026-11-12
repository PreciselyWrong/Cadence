import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarProjects from '../SidebarProjects';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => true,
}));
jest.mock('../../../hooks/useCan', () => ({ useCan: () => true }));
jest.mock('../../../hooks/useSidebarSectionBadge', () => ({
    useSidebarSectionBadge: () => false,
}));
jest.mock('../../../hooks/useSidebarSectionExpanded', () => ({
    useSidebarSectionExpanded: () => [true, jest.fn()],
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            const text = typeof fallback === 'string' ? fallback : key;
            const values = typeof fallback === 'object' ? fallback : options;
            return text.replace(
                /{{(\w+)}}/g,
                (_: string, name: string) => values?.[name] ?? ''
            );
        },
    }),
}));
jest.mock('../../../utils/projectsService', () => ({
    updateProject: jest.fn().mockResolvedValue({}),
}));

const mockProjects = [
    { id: 1, uid: 'home', name: 'Home', status: 'in_progress' },
    {
        id: 2,
        uid: 'kitchen',
        name: 'Kitchen',
        status: 'in_progress',
        parent_project_uid: 'home',
    },
    { id: 3, uid: 'garden', name: 'Garden', status: 'in_progress' },
];

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            projectsStore: {
                projects: mockProjects,
                hasLoaded: true,
                loadProjects: jest.fn(),
                setProjects: jest.fn(),
            },
        }),
}));

const renderProjects = () =>
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

describe('Folding sub-projects in the sidebar', () => {
    beforeEach(() => localStorage.clear());

    it('folds and unfolds the sub-projects of a project, and remembers it', () => {
        const { unmount } = renderProjects();
        expect(screen.getByText('Kitchen')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Fold Garden' })
        ).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Fold Home' }));
        expect(screen.queryByText('Kitchen')).toBeNull();
        expect(screen.getByText('Home')).toBeInTheDocument();

        unmount();
        renderProjects();
        expect(screen.queryByText('Kitchen')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Unfold Home' }));
        expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });
});

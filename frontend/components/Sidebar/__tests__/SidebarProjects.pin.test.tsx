import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarProjects from '../SidebarProjects';
import { updateProject } from '../../../utils/projectsService';

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

const mockSetProjects = jest.fn();
const mockProjects = [
    { id: 1, uid: 'p1', name: 'Home', status: 'in_progress' },
    {
        id: 2,
        uid: 'p2',
        name: 'Garden',
        status: 'in_progress',
        pin_to_sidebar: true,
    },
];

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            projectsStore: {
                projects: mockProjects,
                hasLoaded: true,
                loadProjects: jest.fn(),
                setProjects: mockSetProjects,
            },
        }),
}));

const renderProjects = (handleNavClick = jest.fn()) =>
    render(
        <SidebarProjects
            handleNavClick={handleNavClick}
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

describe('Pinning a project from the sidebar', () => {
    it('pins a project from its row without opening it', () => {
        const handleNavClick = jest.fn();
        renderProjects(handleNavClick);

        fireEvent.click(screen.getByRole('button', { name: 'Pin Home' }));

        expect(updateProject).toHaveBeenCalledWith('p1', {
            pin_to_sidebar: true,
        });
        expect(mockSetProjects).toHaveBeenCalledWith([
            { ...mockProjects[0], pin_to_sidebar: true },
            mockProjects[1],
        ]);
        expect(handleNavClick).not.toHaveBeenCalled();
    });

    it('offers to unpin a project that is already pinned', () => {
        renderProjects();

        expect(
            screen.getByRole('button', { name: 'Unpin Garden' })
        ).toBeInTheDocument();
    });
});

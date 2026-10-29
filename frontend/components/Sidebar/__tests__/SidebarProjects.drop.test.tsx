import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarProjects from '../SidebarProjects';
import { TASK_DRAG_HOVER_EVENT } from '../../Task/taskProjectDrop';

let mockIsMinimal = true;

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => mockIsMinimal,
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
    { id: 2, uid: 'p2', name: 'Work', status: 'in_progress' },
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

const location = {
    pathname: '/today',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const renderProjects = () =>
    render(
        <SidebarProjects
            handleNavClick={jest.fn()}
            location={location}
            isDarkMode={false}
            openProjectModal={jest.fn()}
        />
    );

const rowFor = (name: string) =>
    screen.getByText(name).closest('[data-project-drop-uid]') as HTMLElement;

describe('SidebarProjects as a drop target', () => {
    beforeEach(() => {
        mockIsMinimal = true;
    });

    it('marks each project row with its uid in Minimal', () => {
        renderProjects();

        expect(rowFor('Work').getAttribute('data-project-drop-uid')).toBe('p2');
        expect(rowFor('Home').getAttribute('data-project-drop-uid')).toBe('p1');
    });

    it('highlights only the project a drag hovers, and clears it', () => {
        renderProjects();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_DRAG_HOVER_EVENT, { detail: 'p2' })
            );
        });
        expect(rowFor('Work').className).toContain('ring-blue-500');
        expect(rowFor('Home').className).not.toContain('ring-blue-500');

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_DRAG_HOVER_EVENT, { detail: null })
            );
        });
        expect(rowFor('Work').className).not.toContain('ring-blue-500');
    });

    it('leaves Dense project rows as they were', () => {
        mockIsMinimal = false;
        renderProjects();

        expect(
            screen.getByText('Work').closest('[data-project-drop-uid]')
        ).toBeNull();
    });
});

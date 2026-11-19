import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarProjects from '../SidebarProjects';
import { deleteProject, updateProject } from '../../../utils/projectsService';

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
    initReactI18next: { type: '3rdParty', init: () => undefined },
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
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: jest.fn(),
    }),
}));
jest.mock('../../../utils/projectsService', () => ({
    updateProject: jest.fn().mockResolvedValue({}),
    deleteProject: jest.fn().mockResolvedValue({}),
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
            areasStore: { areas: [], hasLoaded: true, loadAreas: jest.fn() },
        }),
}));

const location = {
    pathname: '/today',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const renderProjects = (handleNavClick = jest.fn()) =>
    render(
        <SidebarProjects
            handleNavClick={handleNavClick}
            location={location}
            isDarkMode={false}
            openProjectModal={jest.fn()}
        />
    );

describe('Right click menu on a sidebar project', () => {
    // The menu loads on the first right click; load it before the tests time.
    beforeAll(() => import('../SidebarProjectMenu'));

    it('offers Open, Edit and Delete, and no Unpin for an unpinned project', async () => {
        renderProjects();

        fireEvent.contextMenu(screen.getByText('Home'));

        const menu = await screen.findByRole('menu');
        expect(
            within(menu).getByRole('menuitem', { name: 'Open' })
        ).toBeInTheDocument();
        expect(
            within(menu).getByRole('menuitem', { name: 'Edit' })
        ).toBeInTheDocument();
        expect(
            within(menu).getByRole('menuitem', { name: 'Delete' })
        ).toBeInTheDocument();
        expect(
            within(menu).queryByRole('menuitem', { name: 'Unpin from sidebar' })
        ).toBeNull();
    });

    it('Open navigates like a left click on the project', async () => {
        const handleNavClick = jest.fn();
        renderProjects(handleNavClick);

        fireEvent.contextMenu(screen.getByText('Home'));
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Open' }));

        expect(handleNavClick).toHaveBeenCalledWith(
            '/project/p1-home',
            'Home',
            expect.anything()
        );
    });

    it('unpins a pinned project from its menu', async () => {
        renderProjects();

        fireEvent.contextMenu(screen.getByText('Garden'));
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Unpin from sidebar' })
        );

        expect(updateProject).toHaveBeenCalledWith('p2', {
            pin_to_sidebar: false,
        });
    });

    it('Delete asks for confirmation, then deletes the project', async () => {
        renderProjects();

        fireEvent.contextMenu(screen.getByText('Home'));
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete' })
        );

        expect(
            await screen.findByText('modals.deleteProject.title')
        ).toBeInTheDocument();
        expect(deleteProject).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(deleteProject).toHaveBeenCalledWith('p1');
    });
});

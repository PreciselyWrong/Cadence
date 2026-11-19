import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarAreas from '../SidebarAreas';
import SidebarTags from '../SidebarTags';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => false,
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
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const state = {
    projectsStore: { projects: [], hasLoaded: true, loadProjects: jest.fn() },
    tagsStore: {
        tags: [{ id: 5, uid: 't1', name: 'errands', pinned: false }],
        hasLoaded: true,
        loadTags: jest.fn(),
        setTags: jest.fn(),
    },
};

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) => selector(state),
}));

const location = { pathname: '/today', search: '' } as any;
const work = { id: 1, uid: 'a1', name: 'Work' } as any;

describe('Right click menu on a sidebar area', () => {
    it('Open navigates like a left click on the area', async () => {
        const handleNavClick = jest.fn();
        render(
            <SidebarAreas
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={false}
                openAreaModal={jest.fn()}
                areas={[work]}
            />
        );

        fireEvent.contextMenu(screen.getByText('Work'));
        const menu = screen.getByRole('menu');
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Open']);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));

        expect(handleNavClick).toHaveBeenCalledWith(
            '/area/a1-work',
            'Work',
            expect.anything()
        );
    });
});

describe('Right click menu on a sidebar tag', () => {
    it('Open navigates like a left click on the tag', () => {
        const handleNavClick = jest.fn();
        render(
            <SidebarTags
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={false}
                openTagModal={jest.fn()}
                tags={state.tagsStore.tags as any}
            />
        );

        fireEvent.contextMenu(screen.getByTestId('sidebar-tag-t1'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));

        expect(handleNavClick).toHaveBeenCalledWith(
            expect.stringContaining('errands'),
            'errands',
            expect.anything()
        );
    });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarBookmarks from '../SidebarBookmarks';
import { updateProject } from '../../../utils/projectsService';

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
jest.mock('../../../utils/notesService', () => ({ updateNote: jest.fn() }));
jest.mock('../../../utils/tagsService', () => ({ updateTag: jest.fn() }));

const state = {
    projectsStore: {
        projects: [
            { id: 1, uid: 'p1', name: 'Garden', pin_to_sidebar: true },
            { id: 2, uid: 'p2', name: 'Taxes', pin_to_sidebar: false },
        ],
        setProjects: jest.fn(),
    },
    notesStore: {
        notes: [{ id: 3, uid: 'n1', title: 'Reading', pin_to_sidebar: true }],
        setNotes: jest.fn(),
    },
    tagsStore: {
        tags: [{ id: 4, uid: 't1', name: 'errands', pinned: true }],
        setTags: jest.fn(),
    },
};

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) => selector(state),
}));

const location = {
    pathname: '/today',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

describe('SidebarBookmarks', () => {
    beforeEach(() => localStorage.clear());

    it('lists every pinned item without having to expand a section', () => {
        render(
            <SidebarBookmarks handleNavClick={jest.fn()} location={location} />
        );

        expect(
            screen.getByRole('region', { name: 'Pinned' })
        ).toBeInTheDocument();
        expect(screen.getByText('Garden')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.getByText('errands')).toBeInTheDocument();
        expect(screen.queryByText('Taxes')).toBeNull();
    });

    it('stays open even when the old collapsed state was saved', () => {
        localStorage.setItem('bookmarksSidebarCollapsed', 'true');
        render(
            <SidebarBookmarks handleNavClick={jest.fn()} location={location} />
        );

        expect(screen.getByText('Garden')).toBeInTheDocument();
    });

    it('opens a pinned project and unpins it from its tile', () => {
        const handleNavClick = jest.fn();
        render(
            <SidebarBookmarks
                handleNavClick={handleNavClick}
                location={location}
            />
        );

        fireEvent.click(screen.getByText('Garden'));
        expect(handleNavClick).toHaveBeenCalledWith(
            '/project/p1-garden',
            'Garden',
            expect.anything()
        );

        // Right click on the tile offers Unpin; nothing shows on hover.
        fireEvent.contextMenu(screen.getByText('Garden'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin Garden' }));
        expect(updateProject).toHaveBeenCalledWith('p1', {
            pin_to_sidebar: false,
        });
    });
});

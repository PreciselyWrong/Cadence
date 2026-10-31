import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarProjects from '../SidebarProjects';
import SidebarTags from '../SidebarTags';
import SidebarAreas from '../SidebarAreas';
import SidebarSmartLists from '../SidebarSmartLists';
import SidebarNav from '../SidebarNav';
import { SIDEBAR_DRAG_HOVER_EVENT } from '../sidebarDrop';
import { updateProject } from '../../../utils/projectsService';

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

jest.mock('../../../utils/inboxService', () => ({
    loadInboxItemsToStore: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/tasksService', () => ({
    fetchSmartTaskCounts: jest.fn().mockResolvedValue({}),
    updateTask: jest.fn(),
    fetchTaskByUid: jest.fn(),
}));

jest.mock('../../../utils/projectsService', () => ({
    updateProject: jest.fn().mockResolvedValue({}),
    fetchProjects: jest.fn().mockResolvedValue([]),
}));

const mockState = {
    projectsStore: {
        projects: [
            { id: 1, uid: 'p1', name: 'Home', status: 'in_progress' },
            {
                id: 2,
                uid: 'p2',
                name: 'Work',
                status: 'in_progress',
                area_id: 10,
            },
        ],
        hasLoaded: true,
        loadProjects: jest.fn(),
        setProjects: jest.fn(),
    },
    tagsStore: {
        tags: [
            { id: 1, uid: 'g1', name: 'perso' },
            { id: 2, uid: 'g2', name: 'perso/sport' },
        ],
        hasLoaded: true,
        loadTags: jest.fn(),
    },
    areasStore: {
        areas: [
            { id: 10, uid: 'a10', name: 'Job' },
            { id: 11, uid: 'a11', name: 'Life' },
        ],
    },
    inboxStore: { pagination: { total: 0 } },
    userSettingsStore: {
        calendarEnabled: false,
        hasCollaborators: false,
        sidebarVisibleSections: {},
        sidebarLinkOrder: [],
        sidebarMinimal: {
            smartLists: [
                { key: 'today', visible: true, showCount: false },
                { key: 'tomorrow', visible: true, showCount: false },
                { key: 'next7', visible: true, showCount: false },
            ],
        },
    },
};

jest.mock('../../../store/useStore', () => ({
    useStore: Object.assign(
        (selector?: any) => (selector ? selector(mockState) : mockState),
        { getState: () => mockState }
    ),
}));

const location = {
    pathname: '/notes',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const hover = (key: string | null) =>
    act(() => {
        window.dispatchEvent(
            new CustomEvent(SIDEBAR_DRAG_HOVER_EVENT, { detail: key })
        );
    });

const targetOf = (text: string) =>
    screen.getByText(text).closest('[data-sidebar-drop]') as HTMLElement;

const lit = (element: HTMLElement) =>
    element.className.includes('ring-blue-500');

const renderProjects = () =>
    render(
        <SidebarProjects
            handleNavClick={jest.fn()}
            location={location}
            isDarkMode={false}
            openProjectModal={jest.fn()}
        />
    );

const renderTags = () =>
    render(
        <SidebarTags
            handleNavClick={jest.fn()}
            location={location}
            isDarkMode={false}
            openTagModal={jest.fn()}
            tags={[]}
        />
    );

const renderAreas = () =>
    render(
        <SidebarAreas
            handleNavClick={jest.fn()}
            location={location}
            isDarkMode={false}
            openAreaModal={jest.fn()}
            areas={mockState.areasStore.areas as any}
        />
    );

describe.each([
    ['Minimal', true],
    ['Dense', false],
])('sidebar drop targets in %s', (_density, minimal) => {
    beforeEach(() => {
        mockIsMinimal = minimal;
    });

    afterEach(() => hover(null));

    it('marks project rows and lights only the hovered one', () => {
        renderProjects();
        expect(targetOf('Work').getAttribute('data-sidebar-drop')).toBe(
            'project:p2'
        );

        hover('project:p2');
        expect(lit(targetOf('Work'))).toBe(true);
        expect(lit(targetOf('Home'))).toBe(false);

        hover(null);
        expect(lit(targetOf('Work'))).toBe(false);
    });

    it('marks tag rows by uid and lights the hovered one', () => {
        renderTags();
        expect(targetOf('sport').getAttribute('data-sidebar-drop')).toBe(
            'tag:g2'
        );

        hover('tag:g2');
        expect(lit(targetOf('sport'))).toBe(true);
        expect(lit(targetOf('perso'))).toBe(false);
    });

    it('marks area rows and lights the hovered one', () => {
        renderAreas();
        expect(targetOf('Job').getAttribute('data-sidebar-drop')).toBe(
            'area:a10'
        );

        hover('area:a11');
        expect(lit(targetOf('Life'))).toBe(true);
        expect(lit(targetOf('Job'))).toBe(false);
    });

    it('lets a project row be dragged onto an area', () => {
        renderProjects();
        const row = targetOf('Home');
        expect(row).toHaveAttribute('draggable', 'true');
        const area = document.createElement('div');
        area.setAttribute('data-sidebar-drop', 'area:a11');
        document.body.appendChild(area);

        fireEvent.dragStart(row, {
            dataTransfer: { setData: jest.fn(), effectAllowed: '' },
        });
        fireEvent.drop(area);

        expect(updateProject).toHaveBeenCalledWith('p1', { area_id: 11 });
        area.remove();
    });
});

describe('day targets', () => {
    afterEach(() => hover(null));

    it('Minimal: Today and Tomorrow take a drop, Next 7 days does not', () => {
        render(
            <SidebarSmartLists handleNavClick={jest.fn()} location={location} />
        );
        const today = screen.getByTestId('sidebar-smart-today');
        expect(today).toHaveAttribute('data-sidebar-drop', 'day:today');
        expect(screen.getByTestId('sidebar-smart-tomorrow')).toHaveAttribute(
            'data-sidebar-drop',
            'day:tomorrow'
        );
        expect(screen.getByTestId('sidebar-smart-next7')).not.toHaveAttribute(
            'data-sidebar-drop'
        );

        hover('day:today');
        expect(lit(today)).toBe(true);
    });

    it('Dense: the Today link takes a drop', () => {
        render(
            <SidebarNav
                handleNavClick={jest.fn()}
                location={location}
                isDarkMode={false}
                openTaskModal={jest.fn()}
            />
        );
        const today = screen.getByTestId('sidebar-nav-today');
        expect(today).toHaveAttribute('data-sidebar-drop', 'day:today');

        hover('day:today');
        expect(lit(today)).toBe(true);
        expect(screen.getByTestId('sidebar-nav-inbox')).not.toHaveAttribute(
            'data-sidebar-drop'
        );
    });
});

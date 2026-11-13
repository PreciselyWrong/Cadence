import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Sidebar from '../../Sidebar';
import { useStore } from '../../../store/useStore';
import { resolveMinimalSidebar } from '../../../utils/minimalSidebar';

let mockPathname = '/today';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('react-router-dom', () => ({
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: mockPathname, search: '', hash: '' }),
}));

jest.mock('../SidebarMiniMonth', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../../utils/inboxService', () => ({
    loadInboxItemsToStore: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../utils/tasksService', () => ({
    fetchSmartTaskCounts: jest.fn().mockResolvedValue({ today: 0, next7: 0 }),
}));

function mockStub(testId: string) {
    const Stub = () => <div data-testid={testId} />;
    return Stub;
}

jest.mock('../SidebarNav', () => ({
    __esModule: true,
    default: mockStub('nav'),
}));
jest.mock('../SidebarFooter', () => ({
    __esModule: true,
    default: mockStub('footer'),
}));
jest.mock('../SidebarAdmin', () => ({
    __esModule: true,
    default: mockStub('admin'),
}));
jest.mock('../SidebarBookmarks', () => ({
    __esModule: true,
    default: mockStub('favorites'),
}));
jest.mock('../SidebarProjects', () => ({
    __esModule: true,
    default: mockStub('projects'),
}));
jest.mock('../SidebarAreas', () => ({
    __esModule: true,
    default: mockStub('areas'),
}));
jest.mock('../SidebarGoals', () => ({
    __esModule: true,
    default: mockStub('goals'),
}));
jest.mock('../SidebarNotes', () => ({
    __esModule: true,
    default: mockStub('notes'),
}));
jest.mock('../SidebarTags', () => ({
    __esModule: true,
    default: mockStub('tags'),
}));
jest.mock('../SidebarHabits', () => ({
    __esModule: true,
    default: mockStub('habits'),
}));
jest.mock('../SidebarGoalsPanel', () => ({
    __esModule: true,
    default: mockStub('goals'),
}));
jest.mock('../SidebarHabitsPanel', () => ({
    __esModule: true,
    default: mockStub('habits'),
}));

const renderSidebar = () =>
    render(
        <Sidebar
            isSidebarOpen
            setIsSidebarOpen={jest.fn()}
            currentUser={{ email: 'a@example.test' }}
            isDarkMode={false}
            toggleDarkMode={jest.fn()}
            openTaskModal={jest.fn()}
            openProjectModal={jest.fn()}
            onCreateNote={jest.fn()}
            openAreaModal={jest.fn()}
            openGoalModal={jest.fn()}
            openTagModal={jest.fn()}
            openPersonModal={jest.fn()}
            openNewHabit={jest.fn()}
            notes={[]}
            areas={[]}
            tags={[]}
        />
    );

const setSidebar = (saved: unknown) =>
    act(() => {
        useStore.setState((state: any) => ({
            userSettingsStore: {
                ...state.userSettingsStore,
                uiDensity: 'minimal',
                habitsEnabled: true,
                sidebarVisibleSections: {},
                sidebarMinimal: resolveMinimalSidebar(saved),
            },
        }));
    });

describe('Sidebar panel follows the open rail section', () => {
    beforeEach(() => setSidebar(undefined));

    it('shows the notes panel on /notes, not the tasks panel', () => {
        mockPathname = '/notes';
        renderSidebar();

        expect(screen.getByTestId('notes')).toBeInTheDocument();
        expect(screen.queryByTestId('projects')).toBeNull();
    });

    it('shows the tasks panel on /today, not the notes panel', () => {
        mockPathname = '/today';
        renderSidebar();

        expect(screen.getByTestId('projects')).toBeInTheDocument();
        expect(screen.queryByTestId('notes')).toBeNull();
    });

    it('shows the goals and habits panels on their routes', () => {
        mockPathname = '/goals';
        const { unmount } = renderSidebar();
        expect(screen.getByTestId('goals')).toBeInTheDocument();
        expect(screen.queryByTestId('projects')).toBeNull();
        unmount();

        mockPathname = '/habits';
        renderSidebar();
        expect(screen.getByTestId('habits')).toBeInTheDocument();
        expect(screen.queryByTestId('projects')).toBeNull();
    });

    it('falls back to the tasks panel for a rail entry without its own panel', () => {
        mockPathname = '/calendar';
        renderSidebar();

        expect(screen.getByTestId('projects')).toBeInTheDocument();
    });

    it('does not render a notes block hidden in the settings', () => {
        setSidebar({
            panels: { notes: [{ key: 'notes', visible: false }] },
        });
        mockPathname = '/notes';
        renderSidebar();

        expect(screen.queryByTestId('notes')).toBeNull();
    });
});

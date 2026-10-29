import React from 'react';
import {
    render,
    screen,
    act,
    waitFor,
    fireEvent,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import Sidebar from '../../Sidebar';
import SidebarSmartLists from '../SidebarSmartLists';
import SidebarRailMinimal from '../SidebarRailMinimal';
import { useStore } from '../../../store/useStore';
import { fetchSmartTaskCounts } from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) =>
            typeof fallback === 'string'
                ? fallback.replace(
                      /\{\{(\w+)\}\}/g,
                      (_: string, name: string) => options?.[name] ?? ''
                  )
                : key,
    }),
}));

jest.mock('react-router-dom', () => ({
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/today', search: '' }),
}));

jest.mock('../../../utils/inboxService', () => ({
    loadInboxItemsToStore: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/tasksService', () => ({
    fetchSmartTaskCounts: jest.fn(),
}));

const mockedCounts = fetchSmartTaskCounts as jest.MockedFunction<
    typeof fetchSmartTaskCounts
>;

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
jest.mock('../SidebarPeople', () => ({
    __esModule: true,
    default: mockStub('people'),
}));
jest.mock('../SidebarHabits', () => ({
    __esModule: true,
    default: mockStub('habits'),
}));
jest.mock('../SidebarViews', () => ({
    __esModule: true,
    default: mockStub('views'),
}));
jest.mock('../SidebarBoards', () => ({
    __esModule: true,
    default: mockStub('boards'),
}));
jest.mock('../SidebarInsights', () => ({
    __esModule: true,
    default: mockStub('insights'),
}));

const location = {
    pathname: '/today',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const DEFAULT_OPTIONS = {
    habitsEnabled: true,
    calendarEnabled: true,
    hasCollaborators: true,
    templatesEnabled: true,
    sidebarVisibleSections: {},
};

// Applies the density and the saved minimal sidebar, as App.tsx does after
// loading the profile.
const setUp = (
    uiDensity: 'minimal' | 'dense',
    saved?: unknown,
    options: Partial<typeof DEFAULT_OPTIONS> = {}
) => {
    act(() => {
        useStore.setState((state: any) => ({
            userSettingsStore: {
                ...state.userSettingsStore,
                ...DEFAULT_OPTIONS,
                ...options,
                uiDensity,
            },
        }));
        useStore.getState().userSettingsStore.setSidebarMinimal(saved);
    });
};

const smartListOrder = () =>
    screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('data-testid') ?? '')
        .filter((id) => id.startsWith('sidebar-smart-'));

describe('Minimal sidebar customization', () => {
    beforeEach(() => {
        mockedCounts.mockResolvedValue({ today: 3, tomorrow: 5, next7: 9 });
        act(() => {
            useStore.setState((state: any) => ({
                inboxStore: {
                    ...state.inboxStore,
                    pagination: { ...state.inboxStore.pagination, total: 2 },
                },
            }));
        });
        setUp('minimal');
    });

    it('hiding a smart list removes it from the panel', () => {
        setUp('minimal', {
            smartLists: [{ key: 'today', visible: false, showCount: true }],
        });

        render(
            <SidebarSmartLists handleNavClick={jest.fn()} location={location} />
        );

        expect(screen.queryByTestId('sidebar-smart-today')).toBeNull();
        expect(
            screen.getByTestId('sidebar-smart-tomorrow')
        ).toBeInTheDocument();
    });

    it('hiding a count hides the badge but keeps the row', async () => {
        setUp('minimal', {
            smartLists: [{ key: 'today', visible: true, showCount: false }],
        });

        render(
            <SidebarSmartLists handleNavClick={jest.fn()} location={location} />
        );

        await waitFor(() => {
            expect(
                screen.getByTestId('sidebar-smart-tomorrow')
            ).toHaveTextContent('5');
        });
        expect(screen.getByTestId('sidebar-smart-today')).toHaveTextContent(
            'Today'
        );
        expect(screen.getByTestId('sidebar-smart-today')).not.toHaveTextContent(
            '3'
        );
    });

    it('does not fetch smart counts when every count is hidden', async () => {
        setUp('minimal', {
            smartLists: [
                { key: 'today', visible: true, showCount: false },
                { key: 'tomorrow', visible: true, showCount: false },
                { key: 'next7', visible: true, showCount: false },
            ],
        });
        mockedCounts.mockClear();

        render(
            <SidebarSmartLists handleNavClick={jest.fn()} location={location} />
        );

        await waitFor(() => {
            expect(
                screen.getByTestId('sidebar-smart-next7')
            ).toBeInTheDocument();
        });
        expect(mockedCounts).not.toHaveBeenCalled();
    });

    it('moving a rail item to More lists it in More and off the rail', () => {
        setUp('minimal', {
            rail: [{ key: 'today', place: 'more' }],
        });

        render(
            <SidebarRailMinimal
                handleNavClick={jest.fn()}
                location={location}
                canOpenAccess={false}
            />
        );

        expect(screen.queryByTestId('sidebar-rail-today')).toBeNull();
        fireEvent.click(screen.getByTestId('sidebar-rail-more'));
        expect(
            screen.getByTestId('sidebar-rail-more-today')
        ).toBeInTheDocument();
    });

    it('hiding a rail item removes it from the rail and from More', () => {
        setUp('minimal', {
            rail: [{ key: 'notes', place: 'hidden' }],
        });

        render(
            <SidebarRailMinimal
                handleNavClick={jest.fn()}
                location={location}
                canOpenAccess={false}
            />
        );

        expect(screen.queryByTestId('sidebar-rail-notes')).toBeNull();
        fireEvent.click(screen.getByTestId('sidebar-rail-more'));
        expect(screen.queryByTestId('sidebar-rail-more-notes')).toBeNull();
    });

    it('restores the saved order and appends smart lists the save lacks', () => {
        setUp('minimal', {
            smartLists: [
                { key: 'next7', visible: true, showCount: true },
                { key: 'today', visible: true, showCount: true },
            ],
        });

        render(
            <SidebarSmartLists handleNavClick={jest.fn()} location={location} />
        );

        expect(smartListOrder()).toEqual([
            'sidebar-smart-next7',
            'sidebar-smart-today',
            'sidebar-smart-tomorrow',
            'sidebar-smart-inbox',
        ]);
    });

    it('restores a saved rail placement from the profile', () => {
        setUp('minimal', {
            rail: [{ key: 'insights', place: 'more' }],
        });

        render(
            <SidebarRailMinimal
                handleNavClick={jest.fn()}
                location={location}
                canOpenAccess={false}
            />
        );

        expect(screen.queryByTestId('sidebar-rail-insights')).toBeNull();
        fireEvent.click(screen.getByTestId('sidebar-rail-more'));
        expect(
            screen.getByTestId('sidebar-rail-more-insights')
        ).toBeInTheDocument();
    });

    it('ignores the minimal settings in Dense', () => {
        setUp(
            'dense',
            {
                smartLists: [
                    { key: 'today', visible: false, showCount: false },
                ],
            },
            { sidebarVisibleSections: {} }
        );

        render(
            <Sidebar
                isSidebarOpen
                setIsSidebarOpen={jest.fn()}
                currentUser={{ email: 'a@b.c' }}
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

        expect(screen.getByTestId('nav')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-smart-today')).toBeNull();
        expect(screen.queryByTestId('sidebar-smart-inbox')).toBeNull();
    });
});

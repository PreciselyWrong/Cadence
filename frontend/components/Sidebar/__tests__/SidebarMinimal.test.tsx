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
import { useStore } from '../../../store/useStore';
import { fetchSmartTaskCounts } from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
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

const setDensity = (uiDensity: 'minimal' | 'dense') =>
    act(() => {
        useStore.setState((state: any) => ({
            userSettingsStore: {
                ...state.userSettingsStore,
                uiDensity,
                habitsEnabled: true,
                sidebarVisibleSections: {},
            },
        }));
    });

describe('SidebarSmartLists', () => {
    beforeEach(() => {
        setDensity('minimal');
        mockedCounts.mockResolvedValue({ today: 3, tomorrow: 5, next7: 9 });
        act(() => {
            useStore.setState((state: any) => ({
                inboxStore: {
                    ...state.inboxStore,
                    pagination: { ...state.inboxStore.pagination, total: 2 },
                },
            }));
        });
    });

    it('shows Today, Tomorrow, Next 7 days and Inbox with their counts', async () => {
        render(
            <SidebarSmartLists handleNavClick={jest.fn()} location={location} />
        );

        expect(screen.getByText('Today')).toBeInTheDocument();
        expect(screen.getByText('Tomorrow')).toBeInTheDocument();
        expect(screen.getByText('Next 7 days')).toBeInTheDocument();
        expect(screen.getByText('Inbox')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByTestId('sidebar-smart-today')).toHaveTextContent(
                '3'
            );
        });
        expect(screen.getByTestId('sidebar-smart-tomorrow')).toHaveTextContent(
            '5'
        );
        expect(screen.getByTestId('sidebar-smart-next7')).toHaveTextContent(
            '9'
        );
        expect(screen.getByTestId('sidebar-smart-inbox')).toHaveTextContent(
            '2'
        );
    });

    it('opens the tomorrow list from its row', async () => {
        const handleNavClick = jest.fn();
        render(
            <SidebarSmartLists
                handleNavClick={handleNavClick}
                location={location}
            />
        );

        fireEvent.click(screen.getByText('Tomorrow'));

        expect(handleNavClick).toHaveBeenCalledWith(
            '/tasks?type=tomorrow',
            'Tomorrow',
            expect.anything()
        );
    });
});

describe('Sidebar in minimal mode', () => {
    const renderSidebar = (
        isSidebarOpen: boolean,
        currentUser: { email: string; is_admin?: boolean } = {
            email: 'test@example.com',
        }
    ) =>
        render(
            <Sidebar
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={jest.fn()}
                currentUser={currentUser}
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

    beforeEach(() => {
        setDensity('minimal');
        mockedCounts.mockResolvedValue({ today: 0, tomorrow: 0, next7: 0 });
    });

    it('keeps folders and lists in the main panel', () => {
        renderSidebar(true);

        expect(screen.getByTestId('projects')).toBeInTheDocument();
        expect(screen.getByTestId('areas')).toBeInTheDocument();
        expect(screen.getByTestId('tags')).toBeInTheDocument();
        expect(screen.getByTestId('favorites')).toBeInTheDocument();
    });

    it.each(['goals', 'notes', 'people', 'habits', 'views', 'insights'])(
        'moves %s out of the main panel into the rail',
        (id) => {
            renderSidebar(true);

            expect(screen.queryByTestId(id)).toBeNull();
            expect(
                screen.getByTestId(`sidebar-rail-${id}`)
            ).toBeInTheDocument();
        }
    );

    it('keeps Areas and Goals reachable from the rail when the panel is collapsed', () => {
        renderSidebar(false);

        expect(screen.getByTestId('sidebar-rail-areas')).toBeInTheDocument();
        expect(screen.getByTestId('sidebar-rail-goals')).toBeInTheDocument();
    });

    it('puts Boards, Templates and Access in the rail More menu', () => {
        act(() => {
            useStore.setState((state: any) => ({
                userSettingsStore: {
                    ...state.userSettingsStore,
                    templatesEnabled: true,
                },
            }));
        });
        renderSidebar(true, { email: 'admin@example.com', is_admin: true });

        fireEvent.click(screen.getByTestId('sidebar-rail-more'));

        expect(
            screen.getByTestId('sidebar-rail-more-boards')
        ).toBeInTheDocument();
        expect(
            screen.getByTestId('sidebar-rail-more-templates')
        ).toBeInTheDocument();
        expect(
            screen.getByTestId('sidebar-rail-more-access')
        ).toBeInTheDocument();
    });
});

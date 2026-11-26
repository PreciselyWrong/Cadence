import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Layout from '../Layout';

jest.mock('../components/Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

jest.mock('../components/Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: jest.fn(),
    }),
}));

jest.mock('react-router-dom', () => ({
    useLocation: () => ({ pathname: '/areas', search: '' }),
    useNavigate: () => jest.fn(),
}));

jest.mock('../components/Navbar', () => ({
    __esModule: true,
    default: () => <div data-testid="navbar" />,
}));

jest.mock('../components/Sidebar', () => ({
    __esModule: true,
    default: ({ isSidebarOpen, setIsSidebarOpen }: any) => (
        <div data-testid="sidebar" data-open={String(isSidebarOpen)}>
            <button onClick={() => setIsSidebarOpen(true)}>expand</button>
            <button onClick={() => setIsSidebarOpen(false)}>collapse</button>
        </div>
    ),
}));

jest.mock('../components/Capture/CaptureHost', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../components/Task/TaskPane', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../components/Project/ProjectModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../components/Note/NoteModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../components/Area/AreaModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../components/Habits/HabitModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../components/Tag/TagModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../components/People/PersonModal', () => ({
    __esModule: true,
    default: () => null,
}));

const baseStoreState: any = {
    notesStore: {
        notes: [],
        isLoading: false,
        isError: false,
        hasLoaded: true,
        loadNotes: jest.fn(),
        setNotes: jest.fn(),
    },
    areasStore: {
        areas: [],
        isLoading: false,
        isError: false,
        hasLoaded: true,
        loadAreas: jest.fn(),
        setAreas: jest.fn(),
    },
    tasksStore: {
        tasks: [],
        isLoading: false,
        isError: false,
        hasLoaded: true,
        createTask: jest.fn(),
    },
    projectsStore: {
        // Non-empty so Layout's own "load projects if empty" effect doesn't
        // fire a real fetch during these tests.
        projects: [{ id: 1, uid: 'p1', name: 'Project 1' }],
        setProjects: jest.fn(),
        isLoading: false,
        isError: false,
        hasLoaded: true,
    },
    tagsStore: {
        tags: [],
        isLoading: false,
        isError: false,
        hasLoaded: true,
        setTags: jest.fn(),
    },
    peopleStore: {
        people: [],
    },
};

let storeState: any = baseStoreState;

jest.mock('../store/useStore', () => {
    const mockUseStore: any = () => storeState;
    mockUseStore.getState = () => storeState;
    return { useStore: mockUseStore };
});

const renderLayout = () =>
    render(
        <Layout
            currentUser={{ email: 'user@example.com' } as any}
            setCurrentUser={jest.fn()}
            isDarkMode={false}
            toggleDarkMode={jest.fn()}
        >
            <div data-testid="routed-page">Areas page content</div>
        </Layout>
    );

describe('Layout loading gate', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
        }) as any;
        storeState = baseStoreState;
    });

    it('renders the routed page once every store has loaded at least once', () => {
        renderLayout();

        expect(screen.getByTestId('routed-page')).toBeInTheDocument();
    });

    it('does not swap the routed page out for the full-screen loader when a store that has already loaded starts a background refresh', () => {
        // Mirrors Areas.tsx calling loadAreas(true) on every mount: areasStore
        // goes back into isLoading even though hasLoaded is already true.
        storeState = {
            ...baseStoreState,
            areasStore: {
                ...baseStoreState.areasStore,
                isLoading: true,
                hasLoaded: true,
            },
        };

        renderLayout();

        // Regression guard for #1427: if Layout unmounted the routed page
        // here, the page's mount effect would refire its forced reload,
        // looping forever.
        expect(screen.getByTestId('routed-page')).toBeInTheDocument();
        expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
    });

    it('still shows the full-screen loader while a store has not loaded for the first time yet', () => {
        storeState = {
            ...baseStoreState,
            areasStore: {
                ...baseStoreState.areasStore,
                isLoading: true,
                hasLoaded: false,
            },
        };

        renderLayout();

        expect(screen.queryByTestId('routed-page')).not.toBeInTheDocument();
    });

    it('does not swap the routed page out when tasksStore refetches after it has already loaded', () => {
        // Mirrors ProductivityPage.tsx calling loadTasks() on mount: tasksStore
        // goes back into isLoading even though hasLoaded is already true.
        storeState = {
            ...baseStoreState,
            tasksStore: {
                ...baseStoreState.tasksStore,
                isLoading: true,
                hasLoaded: true,
            },
        };

        renderLayout();

        // Regression guard for #1410: if Layout unmounted the routed page
        // here, ProductivityPage's mount effect would refire loadTasks(),
        // looping forever when the user has zero tasks.
        expect(screen.getByTestId('routed-page')).toBeInTheDocument();
        expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
    });
    it('keeps the routed page mounted when a store starts its first load after the page is shown', () => {
        // A page opened from a link mounts, then areas start loading. Swapping
        // the page out for the loader remounted it, so it fetched twice (#2022).
        let mounts = 0;
        const Page = () => {
            React.useEffect(() => {
                mounts += 1;
            }, []);
            return <div data-testid="routed-page">Project page</div>;
        };
        const layout = () => (
            <Layout
                currentUser={{ email: 'user@example.com' } as any}
                setCurrentUser={jest.fn()}
                isDarkMode={false}
                toggleDarkMode={jest.fn()}
            >
                <Page />
            </Layout>
        );
        storeState = {
            ...baseStoreState,
            areasStore: { ...baseStoreState.areasStore, hasLoaded: false },
        };
        const { rerender } = render(layout());

        storeState = {
            ...baseStoreState,
            areasStore: {
                ...baseStoreState.areasStore,
                isLoading: true,
                hasLoaded: false,
            },
        };
        rerender(layout());
        expect(screen.getByTestId('routed-page')).toBeInTheDocument();

        storeState = baseStoreState;
        rerender(layout());
        expect(mounts).toBe(1);
    });

    it('keeps the routed page when a store fails to load and retries that store', () => {
        const loadAreas = jest.fn();
        storeState = {
            ...baseStoreState,
            areasStore: {
                ...baseStoreState.areasStore,
                isError: true,
                loadAreas,
            },
        };

        renderLayout();

        expect(screen.getByTestId('routed-page')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.retry'));
        expect(loadAreas).toHaveBeenCalledWith(true);
    });
});

describe('Layout sidebar default and remembered choice', () => {
    const setWidth = (width: number) => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            writable: true,
            value: width,
        });
    };
    const isOpen = () =>
        screen.getByTestId('sidebar').getAttribute('data-open');

    beforeEach(() => {
        storeState = baseStoreState;
        localStorage.clear();
    });

    it('collapses to the rail below 1280 px and opens from 1280 px', () => {
        setWidth(1100);
        const small = renderLayout();
        expect(isOpen()).toBe('false');
        small.unmount();

        setWidth(1400);
        renderLayout();
        expect(isOpen()).toBe('true');
    });

    it('follows the window width on resize while no choice was made', () => {
        setWidth(1400);
        renderLayout();
        setWidth(1100);
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(isOpen()).toBe('false');
    });

    it('lets an explicit expand win below 1280 px, now and on the next visit', () => {
        setWidth(1100);
        const first = renderLayout();
        fireEvent.click(screen.getByText('expand'));
        expect(isOpen()).toBe('true');
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(isOpen()).toBe('true');
        first.unmount();

        renderLayout();
        expect(isOpen()).toBe('true');
    });

    it('lets an explicit collapse win on a wide window', () => {
        setWidth(1400);
        const first = renderLayout();
        fireEvent.click(screen.getByText('collapse'));
        first.unmount();

        renderLayout();
        expect(isOpen()).toBe('false');
    });

    it('does not remember the drawer closing itself on a phone', () => {
        setWidth(400);
        renderLayout();
        fireEvent.click(screen.getByText('collapse'));
        expect(localStorage.getItem('sidebarOpen')).toBeNull();
    });
});

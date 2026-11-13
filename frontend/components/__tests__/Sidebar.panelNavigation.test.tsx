import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

jest.mock('../../hooks/useUiDensity', () => ({
    useIsMinimal: () => true,
}));

// The rail stands in for the minimal rail: one button that navigates.
jest.mock('../Sidebar/SidebarRailMinimal', () => ({
    __esModule: true,
    default: (props: any) => (
        <button
            type="button"
            onClick={() => props.handleNavClick('/today', 'Today')}
        >
            go to today
        </button>
    ),
    panelRailIdFor: () => null,
}));

jest.mock('../Sidebar/SidebarFooter', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Sidebar/SidebarResizeHandle', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Billing/SidebarTrialCard', () => ({
    __esModule: true,
    default: () => null,
}));

const storeState: any = {
    userSettingsStore: {
        habitsEnabled: true,
        sidebarVisibleSections: {},
        sidebarSectionOrder: [],
        sidebarWidthPercent: 100,
        sidebarMinimal: {
            smartLists: [],
            panel: [],
            panels: { notes: [], goals: [], habits: [] },
        },
    },
};

jest.mock('../../store/useStore', () => ({
    useStore: (selector: (state: any) => unknown) => selector(storeState),
}));

const setWindowWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
    });
};

const renderOpenSidebarOn = (path: string, setIsSidebarOpen: jest.Mock) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Sidebar
                isSidebarOpen
                setIsSidebarOpen={setIsSidebarOpen}
                currentUser={{ email: 'user@example.com' }}
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
        </MemoryRouter>
    );

describe('sidebar panel across navigation', () => {
    const originalWidth = window.innerWidth;

    afterEach(() => {
        setWindowWidth(originalWidth);
    });

    it.each([800, 1200])(
        'keeps the panel open after a route change at %spx',
        (width) => {
            setWindowWidth(width);
            const setIsSidebarOpen = jest.fn();
            renderOpenSidebarOn('/notes', setIsSidebarOpen);

            fireEvent.click(screen.getByText('go to today'));

            expect(setIsSidebarOpen).not.toHaveBeenCalledWith(false);
        }
    );

    it('closes the drawer after a route change on a phone', () => {
        setWindowWidth(500);
        const setIsSidebarOpen = jest.fn();
        renderOpenSidebarOn('/notes', setIsSidebarOpen);

        fireEvent.click(screen.getByText('go to today'));

        expect(setIsSidebarOpen).toHaveBeenCalledWith(false);
    });
});

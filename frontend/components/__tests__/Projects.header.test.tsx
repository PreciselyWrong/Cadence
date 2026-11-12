import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Projects from '../Projects';
import { ToastProvider } from '../Shared/ToastContext';
import { updateUiSettings } from '../../utils/profileService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

jest.mock('../Project/ProjectItem', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Project/ProjectModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Project/ProjectShareModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Shared/ConfirmDialog', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Spreadsheet/ImportWizard', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Shared/SortableItem', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../Sidebar/sidebarDrop', () => ({
    useSidebarDrop: () => ({}),
}));
jest.mock('../Project/useCompleteProject', () => ({
    __esModule: true,
    default: () => ({ requestComplete: jest.fn(), completeDialog: null }),
    countOpenTasks: () => 0,
}));
jest.mock('../../hooks/useCan', () => ({
    useCan: () => true,
}));
jest.mock('../../utils/focus', () => ({
    projectMatchesFocus: () => true,
    useFocus: () => null,
}));
jest.mock('../../utils/profileService', () => ({
    fetchProfile: jest.fn(() => Promise.resolve({ ui_settings: {} })),
    updateUiSettings: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../utils/areasService', () => ({
    fetchAreas: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../utils/projectsService', () => ({
    fetchProjects: jest.fn(() => Promise.resolve([])),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
    reorderProjects: jest.fn(),
    fetchDormantProjects: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../utils/templatesService', () => ({
    saveProjectAsTemplate: jest.fn(),
}));

jest.mock('../../store/useStore', () => {
    const state = {
        areasStore: {
            areas: [],
            setAreas: jest.fn(),
            setError: jest.fn(),
        },
        projectsStore: {
            projects: [
                {
                    uid: 'p1',
                    name: 'Launch site',
                    status: 'in_progress',
                    created_at: '2026-10-01T00:00:00Z',
                },
            ],
            setProjects: jest.fn(),
            setError: jest.fn(),
            isLoading: false,
            isError: false,
        },
        userSettingsStore: { templatesEnabled: false },
    };
    const mockUseStore: any = (selector: any) => selector(state);
    mockUseStore.getState = () => state;
    return { useStore: mockUseStore };
});

const renderProjects = () =>
    render(
        <ToastProvider>
            <MemoryRouter>
                <Projects />
            </MemoryRouter>
        </ToastProvider>
    );

describe('Projects page header', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    it('keeps search and New project visible, with no sort or settings button', () => {
        renderProjects();

        expect(
            screen.getByRole('button', { name: 'Search' })
        ).toBeInTheDocument();
        expect(screen.getByTestId('new-project-button')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Sort by' })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId('projects-list-settings')
        ).not.toBeInTheDocument();
    });

    it('puts sort choices in the more menu and applies the one picked', () => {
        renderProjects();

        fireEvent.click(screen.getByTestId('projects-more-menu'));
        const menu = screen.getByRole('menu');
        fireEvent.click(
            within(menu).getByRole('menuitemcheckbox', { name: 'Name' })
        );

        expect(localStorage.getItem('projectsSortOrder')).toBe('name:asc');
    });

    it('puts the someday and completed toggles in the more menu and saves them', () => {
        renderProjects();

        fireEvent.click(screen.getByTestId('projects-more-menu'));
        fireEvent.click(
            within(screen.getByRole('menu')).getByRole('menuitemcheckbox', {
                name: 'Show completed projects',
            })
        );

        expect(updateUiSettings).toHaveBeenCalledWith({
            project: {
                list: { showSomeday: false, showCompleted: true },
            },
        });
    });
});

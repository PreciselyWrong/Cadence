import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectDetails from '../ProjectDetails';
import { fetchProjectBySlug } from '../../../utils/projectsService';

jest.mock('react-router-dom', () => ({
    Link: ({ children, to, ...rest }: any) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
    useParams: () => ({ uidSlug: 'project-slug-123' }),
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/projects/project-slug-123', state: {} }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, optionsOrDefault?: any, maybeOptions?: any) => {
            const options =
                typeof optionsOrDefault === 'object' &&
                optionsOrDefault !== null
                    ? optionsOrDefault
                    : maybeOptions;

            let template = key;
            if (key === 'common.loading') {
                template = 'Chargement…';
            } else if (key === 'modals.deleteProject.message') {
                template =
                    'Czy na pewno chcesz usunąć projekt "{{projectName}}"?';
            } else if (typeof optionsOrDefault === 'string') {
                template = optionsOrDefault;
            } else if (options && typeof options.defaultValue === 'string') {
                template = options.defaultValue;
            }

            if (options && typeof options === 'object') {
                return template.replace(/\{\{(\w+)\}\}/g, (_, varName) =>
                    options[varName] !== undefined
                        ? String(options[varName])
                        : `{{${varName}}}`
                );
            }
            return template;
        },
        i18n: { language: 'pl' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'pl' },
}));

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Note/NoteModal', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../ProjectModal', () => ({
    __esModule: true,
    default: ({ project }: { project?: { name: string } }) => (
        <div data-testid="project-edit-panel">{project?.name}</div>
    ),
}));

const mockStoreState = {
    areasStore: {
        areas: [],
        hasLoaded: true,
        isLoading: false,
        loadAreas: jest.fn(),
    },
    projectsStore: {
        projects: [],
        setProjects: jest.fn(),
    },
    userSettingsStore: {
        templatesEnabled: false,
    },
    notesStore: {
        notes: [],
        setNotes: jest.fn(),
    },
    tagsStore: {
        tags: [],
        hasLoaded: true,
        isLoading: false,
        loadTags: jest.fn(),
        addNewTags: jest.fn(),
        getTags: jest.fn().mockReturnValue([]),
    },
};

jest.mock('../../../store/useStore', () => ({
    useStore: Object.assign(() => mockStoreState, {
        getState: () => mockStoreState,
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
    fetchProjectBySlug: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
    fetchProjects: jest.fn().mockResolvedValue([]),
    saveProjectAsTemplate: jest.fn(),
}));

jest.mock('../../../utils/tasksService', () => ({
    fetchTaskOrder: jest.fn().mockResolvedValue([]),
    createTask: jest.fn(),
    deleteTask: jest.fn(),
    saveTaskOrder: jest.fn(),
}));

jest.mock('../../../utils/notesService', () => ({
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
    createNote: jest.fn(),
}));

jest.mock('../../../utils/goalsService', () => ({
    fetchGoals: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../AI/ProjectAIInsights', () => {
    const MockAI = React.forwardRef(() => null);
    MockAI.displayName = 'MockProjectAIInsights';
    return {
        __esModule: true,
        default: MockAI,
    };
});

jest.mock('../ProjectInsightsPanel', () => ({
    __esModule: true,
    default: () => null,
}));

let mockMinimal = false;
jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => mockMinimal,
    useUiDensity: () => (mockMinimal ? 'minimal' : 'dense'),
}));
jest.mock('../../../hooks/useViewType', () => ({
    useViewType: () => ({
        viewType: 'list',
        setViewType: jest.fn(),
        loaded: true,
    }),
}));
jest.mock('../ProjectTasksSection', () => ({
    __esModule: true,
    default: () => null,
}));
let mockOutlineProps: any = null;
jest.mock('../ProjectOutline', () => ({
    __esModule: true,
    default: (props: any) => {
        mockOutlineProps = props;
        return (
            <ol data-testid="outline">
                {props.tasks.map((task: any) => (
                    <li key={task.uid}>{task.name}</li>
                ))}
            </ol>
        );
    },
}));

describe('ProjectDetails delete confirmation (#1826)', () => {
    it('interpolates project name in delete confirm dialog and does not display literal placeholder', async () => {
        const testProject = {
            id: 99,
            uid: 'proj-99',
            name: 'Apollo Moon Mission',
            description: '',
            status: 'in_progress',
            tasks: [],
            notes: [],
        };
        (fetchProjectBySlug as jest.Mock).mockResolvedValue(testProject);

        render(<ProjectDetails />);

        await waitFor(() => {
            expect(screen.getByText('Apollo Moon Mission')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByLabelText('More options'));
        fireEvent.click(screen.getByText('Delete'));

        expect(
            screen.getByText(
                'Czy na pewno chcesz usunąć projekt "Apollo Moon Mission"?'
            )
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/\{\{projectName\}\}/)
        ).not.toBeInTheDocument();
    });
});

describe('ProjectDetails edit menu item', () => {
    it('lists sub-projects as rows with their open task count', async () => {
        (fetchProjectBySlug as jest.Mock).mockResolvedValue({
            id: 101,
            uid: 'house1',
            name: 'Maison',
            status: 'in_progress',
            tasks: [],
            notes: [],
            SubProjects: [
                {
                    uid: 'kit1',
                    name: 'Cuisine',
                    status: 'in_progress',
                    icon: 'cook',
                    open_tasks_count: 3,
                },
            ],
        });

        render(<ProjectDetails />);

        const row = await screen.findByRole('link', { name: /Cuisine/ });
        expect(row).toHaveAttribute('href', '/project/kit1-cuisine');
        expect(row).toHaveTextContent('3');
        expect(row.querySelector('svg path')).toBeInTheDocument();
    });

    it('opens the project side panel from the three dot menu', async () => {
        (fetchProjectBySlug as jest.Mock).mockResolvedValue({
            id: 100,
            uid: 'proj-100',
            name: 'Schedule with WBS',
            description: '',
            status: 'in_progress',
            tasks: [],
            notes: [],
        });

        render(<ProjectDetails />);

        await waitFor(() => {
            expect(screen.getByText('Schedule with WBS')).toBeInTheDocument();
        });
        expect(
            screen.queryByTestId('project-edit-panel')
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('More options'));
        fireEvent.click(screen.getByTestId('project-edit'));

        expect(screen.getByTestId('project-edit-panel')).toHaveTextContent(
            'Schedule with WBS'
        );
    });
});

describe('ProjectDetails loading', () => {
    it('says it is loading in the user language', () => {
        (fetchProjectBySlug as jest.Mock).mockReturnValue(
            new Promise(() => {})
        );
        render(<ProjectDetails />);
        expect(screen.getByText('Chargement…')).toBeInTheDocument();
        expect(screen.queryByText(/Loading project/)).not.toBeInTheDocument();
    });
});

describe('ProjectDetails when the project cannot be loaded (#2022)', () => {
    const failWith = (status: number) => {
        const error = new Error('Request failed');
        (error as any).status = status;
        (fetchProjectBySlug as jest.Mock).mockReset();
        (fetchProjectBySlug as jest.Mock).mockRejectedValue(error);
    };

    it('says you have no access on a 403, and asks once', async () => {
        failWith(403);

        render(<ProjectDetails />);

        expect(
            await screen.findByText("You don't have access to this project")
        ).toBeInTheDocument();
        expect(
            screen.getByText("Ask the project's owner to share it with you.")
        ).toBeInTheDocument();
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
        expect(
            screen.queryByText('Failed to load project details.')
        ).not.toBeInTheDocument();
        expect(fetchProjectBySlug).toHaveBeenCalledTimes(1);
    });

    it('says the project is gone on a 404', async () => {
        failWith(404);

        render(<ProjectDetails />);

        expect(
            await screen.findByText("This project doesn't exist or was deleted")
        ).toBeInTheDocument();
        expect(fetchProjectBySlug).toHaveBeenCalledTimes(1);
    });

    it('keeps the load failure message for other errors', async () => {
        failWith(500);

        render(<ProjectDetails />);

        expect(
            await screen.findByText('Failed to load project details.')
        ).toBeInTheDocument();
        expect(
            screen.queryByText("You don't have access to this project")
        ).not.toBeInTheDocument();
        expect(fetchProjectBySlug).toHaveBeenCalledTimes(1);
    });

    describe('Add button', () => {
        const project = {
            id: 102,
            uid: 'proj-102',
            name: 'Garden',
            status: 'in_progress',
            tasks: [],
            notes: [],
        };

        afterEach(() => {
            mockMinimal = false;
            localStorage.clear();
        });

        it('leaves adding to the inline line on the Minimal task list', async () => {
            mockMinimal = true;
            (fetchProjectBySlug as jest.Mock).mockResolvedValue(project);
            render(<ProjectDetails />);

            await screen.findByText('Garden');
            expect(
                screen.queryByTestId('project-add-button')
            ).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('project-view-board'));
            expect(
                screen.getByTestId('project-add-button')
            ).toBeInTheDocument();
        });

        it('keeps the Add button in Dense, which has no inline line', async () => {
            (fetchProjectBySlug as jest.Mock).mockResolvedValue(project);
            render(<ProjectDetails />);

            await screen.findByText('Garden');
            expect(
                screen.getByTestId('project-add-button')
            ).toBeInTheDocument();
        });
    });

    describe('Outline order', () => {
        const task = (uid: string, name: string, created: string) => ({
            id: Number(uid.slice(1)),
            uid,
            name,
            status: 'not_started',
            created_at: created,
        });
        const project = {
            id: 103,
            uid: 'proj-103',
            name: 'Garage',
            status: 'in_progress',
            tasks: [
                task('t1', 'Alpha', '2026-10-01T00:00:00Z'),
                task('t2', 'Bravo', '2026-10-02T00:00:00Z'),
                task('t3', 'Charlie', '2026-10-03T00:00:00Z'),
            ],
            notes: [],
        };

        afterEach(() => {
            localStorage.clear();
            mockOutlineProps = null;
        });

        it('shows and saves the synced project order whatever the list sort', async () => {
            const { fetchTaskOrder, saveTaskOrder } = jest.requireMock(
                '../../../utils/tasksService'
            );
            localStorage.setItem('project_order_by', 'name:asc');
            (fetchProjectBySlug as jest.Mock).mockResolvedValue(project);
            (fetchTaskOrder as jest.Mock).mockResolvedValue(['t3', 't1', 't2']);
            (saveTaskOrder as jest.Mock).mockResolvedValue(undefined);
            render(<ProjectDetails />);

            await screen.findByText('Garage');
            fireEvent.click(screen.getByTestId('project-view-outline'));
            await waitFor(() =>
                expect(
                    screen
                        .getAllByRole('listitem')
                        .map((item) => item.textContent)
                ).toEqual(['Charlie', 'Alpha', 'Bravo'])
            );

            await mockOutlineProps.onReorder(['t1', 't3', 't2']);

            expect(saveTaskOrder).toHaveBeenCalledWith(
                { scope: 'project', project_uid: 'proj-103' },
                ['t1', 't3', 't2']
            );
            expect(localStorage.getItem('project_order_by')).toBe('name:asc');
        });
    });
});

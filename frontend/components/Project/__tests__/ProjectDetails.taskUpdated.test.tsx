import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectDetails from '../ProjectDetails';
import { fetchProjectBySlug } from '../../../utils/projectsService';
import { TASK_UPDATED_EVENT } from '../../../contexts/TaskPaneContext';

jest.mock('react-router-dom', () => ({
    useParams: () => ({ uidSlug: 'project-slug-123' }),
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/projects/project-slug-123', state: {} }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, optionsOrDefault?: any) =>
            typeof optionsOrDefault === 'string' ? optionsOrDefault : key,
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
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
    default: () => null,
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
    return { __esModule: true, default: MockAI };
});

jest.mock('../ProjectInsightsPanel', () => ({
    __esModule: true,
    default: () => null,
}));

// Renders the rows the page hands down so the test can read the list.
jest.mock('../ProjectTasksSection', () => ({
    __esModule: true,
    default: ({
        displayTasks,
    }: {
        displayTasks: { uid: string; name: string }[];
    }) => (
        <ul data-testid="project-task-list">
            {displayTasks.map((task) => (
                <li key={task.uid}>{task.name}</li>
            ))}
        </ul>
    ),
}));

const baseProject = {
    id: 42,
    uid: 'proj-42',
    name: 'Apollo',
    description: '',
    status: 'in_progress',
    notes: [],
};

const taskA = {
    id: 1,
    uid: 'task-a',
    name: 'Task A',
    status: 0,
    project_uid: 'proj-42',
};
const taskB = {
    id: 2,
    uid: 'task-b',
    name: 'Task B',
    status: 0,
    project_uid: 'proj-42',
};

const dispatchTaskUpdated = (detail: unknown) =>
    act(() => {
        window.dispatchEvent(new CustomEvent(TASK_UPDATED_EVENT, { detail }));
    });

const renderWithTasks = async () => {
    (fetchProjectBySlug as jest.Mock).mockResolvedValue({
        ...baseProject,
        tasks: [taskA, taskB],
    });
    render(<ProjectDetails />);
    await waitFor(() => {
        expect(screen.getByTestId('project-task-list')).toHaveTextContent(
            'Task A'
        );
    });
};

const listedNames = () =>
    Array.from(
        screen.getByTestId('project-task-list').querySelectorAll('li')
    ).map((li) => li.textContent);

describe('ProjectDetails task pane updates', () => {
    it('replaces an edited task in the list without reloading', async () => {
        await renderWithTasks();

        dispatchTaskUpdated({ ...taskA, name: 'Task A renamed' });

        await waitFor(() => {
            expect(listedNames()).toEqual(['Task A renamed', 'Task B']);
        });
        expect(fetchProjectBySlug).toHaveBeenCalledTimes(1);
    });

    it('removes a task that was moved to another project', async () => {
        await renderWithTasks();

        dispatchTaskUpdated({ ...taskA, project_uid: 'proj-other' });

        await waitFor(() => {
            expect(listedNames()).toEqual(['Task B']);
        });
    });

    it('ignores a task-updated event for a task not in this project', async () => {
        await renderWithTasks();

        dispatchTaskUpdated({
            id: 99,
            uid: 'task-zz',
            name: 'Elsewhere',
            project_uid: 'proj-42',
        });

        expect(listedNames()).toEqual(['Task A', 'Task B']);
    });
});

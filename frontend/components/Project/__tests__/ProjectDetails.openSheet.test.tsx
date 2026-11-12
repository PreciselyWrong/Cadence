import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectDetails from '../ProjectDetails';
import { fetchProjectBySlug } from '../../../utils/projectsService';

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

const mockOpenTask = jest.fn();
const mockCloseTask = jest.fn();
let mockOpenTaskUid: string | null = null;
jest.mock('../../../contexts/TaskPaneContext', () => ({
    TASK_UPDATED_EVENT: 'tududi:task-updated',
    useTaskPane: () => ({
        openTask: mockOpenTask,
        closeTask: mockCloseTask,
        openTaskUid: mockOpenTaskUid,
    }),
}));

// Every view hands its task to onOpenTask; a button stands for a card.
function mockView({
    tasks,
    onOpenTask,
}: {
    tasks: { uid: string; name: string }[];
    onOpenTask: (task: unknown) => void;
}) {
    return (
        <div>
            {tasks.map((task) => (
                <button
                    key={task.uid}
                    type="button"
                    onClick={() => onOpenTask(task)}
                >
                    {task.name}
                </button>
            ))}
        </div>
    );
}
jest.mock('../Board/ProjectBoard', () => ({
    __esModule: true,
    default: (props: any) => mockView(props),
}));
jest.mock('../Timeline/ProjectTimeline', () => ({
    __esModule: true,
    default: (props: any) => mockView(props),
}));
jest.mock('../../Task/TaskModal', () => ({
    __esModule: true,
    default: () => <div data-testid="task-drawer" />,
}));

const taskA = {
    id: 1,
    uid: 'task-a',
    name: 'Task A',
    status: 0,
    project_uid: 'proj-42',
};

const renderView = async (view: 'board' | 'timeline') => {
    localStorage.setItem('project_view', view);
    (fetchProjectBySlug as jest.Mock).mockResolvedValue({
        id: 42,
        uid: 'proj-42',
        name: 'Apollo',
        description: '',
        status: 'in_progress',
        notes: [],
        tasks: [taskA],
    });
    render(<ProjectDetails />);
    return screen.findByRole('button', { name: 'Task A' });
};

describe('ProjectDetails views open the common task sheet', () => {
    beforeEach(() => {
        mockOpenTask.mockClear();
        mockCloseTask.mockClear();
        mockOpenTaskUid = null;
    });
    afterEach(() => localStorage.removeItem('project_view'));

    it.each(['board', 'timeline'] as const)(
        'a %s card opens ?task= instead of the side drawer',
        async (view) => {
            fireEvent.click(await renderView(view));
            expect(mockOpenTask).toHaveBeenCalledWith('task-a');
            expect(screen.queryByTestId('task-drawer')).not.toBeInTheDocument();
        }
    );

    it('a second click on the open task closes the sheet', async () => {
        mockOpenTaskUid = 'task-a';
        fireEvent.click(await renderView('board'));
        expect(mockCloseTask).toHaveBeenCalled();
        expect(mockOpenTask).not.toHaveBeenCalled();
    });
});

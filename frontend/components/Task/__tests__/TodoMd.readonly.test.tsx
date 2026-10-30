import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    renderHook,
    act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskModal from '../TaskModal';
import useTaskAutosave from '../useTaskAutosave';
import { updateTask, toggleTaskCompletion } from '../../../utils/tasksService';
import TodoMdProjectNote from '../../Project/TodoMdProjectNote';
import { isTodoMdProject, isTodoMdTask } from '../../../utils/todoMd';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            const text = typeof fallback === 'string' ? fallback : key;
            return options?.path
                ? text.replace('{{path}}', options.path)
                : text;
        },
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));

const showSuccessToast = jest.fn();
const showErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showSuccessToast, showErrorToast }),
}));

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: any) => <div data-testid="markdown">{content}</div>,
}));

jest.mock('../../Inbox/QuickCaptureInput', () => ({
    __esModule: true,
    default: () => <input data-testid="task-name-input" />,
}));

jest.mock('../../../utils/tasksService', () => ({
    updateTask: jest.fn(),
    fetchTaskByUid: jest.fn(),
    fetchSubtasks: jest.fn().mockResolvedValue([]),
    deleteTask: jest.fn(),
    toggleTaskCompletion: jest.fn(),
    moveTaskOccurrence: jest.fn(),
}));

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

jest.mock('../../../utils/peopleService', () => ({
    fetchPeople: jest.fn().mockResolvedValue([]),
    fetchAssignablePeopleForProject: jest.fn().mockResolvedValue([]),
}));

jest.mock('../TaskComments', () => ({
    __esModule: true,
    default: () => <div data-testid="task-comments" />,
}));

jest.mock('../TaskDetails/TaskAttachmentsCard', () => ({
    __esModule: true,
    default: () => <div data-testid="task-attachments" />,
}));

jest.mock('../TaskDetails/TaskSubtasksCard', () => ({
    __esModule: true,
    default: () => <div data-testid="task-subtasks" />,
}));

jest.mock('../../../store/useStore', () => {
    const state: any = {
        projectsStore: { projects: [] },
        areasStore: { areas: [] },
        tagsStore: {
            tags: [],
            hasLoaded: true,
            isLoading: false,
            loadTags: jest.fn(),
            addNewTags: jest.fn(),
        },
        tasksStore: { updateTaskInStore: jest.fn() },
    };
    const useStore: any = (selector: (s: any) => any) => selector(state);
    useStore.getState = () => state;
    return { useStore };
});

describe('TODO.md read-only helpers', () => {
    it('recognises mirrored tasks and projects', () => {
        expect(isTodoMdTask({ source_key: 'abc' })).toBe(true);
        expect(isTodoMdTask({ source_key: null })).toBe(false);
        expect(isTodoMdTask(undefined)).toBe(false);
        expect(isTodoMdProject({ source_type: 'todo_md' })).toBe(true);
        expect(isTodoMdProject({ source_type: null })).toBe(false);
    });
});

describe('Task editor on a task mirrored from a TODO.md file', () => {
    const task = {
        id: 1,
        uid: 't1',
        name: 'Ship the thing',
        status: 0,
        note: 'with a note',
        source_key: 'abc',
        source_section: 'Now',
    } as Task;

    beforeEach(() => jest.clearAllMocks());

    it('shows the task read-only with its section and file badge', () => {
        render(<TaskModal isOpen onClose={jest.fn()} task={task} />);

        expect(screen.getByTestId('todo-md-task-panel')).toBeInTheDocument();
        expect(screen.getByTestId('todo-md-badge')).toBeInTheDocument();
        expect(screen.getByText('Now')).toBeInTheDocument();
        expect(screen.getByTestId('markdown')).toHaveTextContent('with a note');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-name-input')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-subtasks')).not.toBeInTheDocument();
    });

    it('disables every field chip and the postpone button', () => {
        render(<TaskModal isOpen onClose={jest.fn()} task={task} />);

        const chips = screen
            .getByTestId('task-chip-row')
            .querySelectorAll('button');
        expect(chips.length).toBeGreaterThan(0);
        chips.forEach((chip) => expect(chip).toBeDisabled());
        expect(screen.getByTestId('task-postpone-button')).toBeDisabled();
    });

    it('still lets the done toggle through and never sends another edit', async () => {
        (toggleTaskCompletion as jest.Mock).mockResolvedValue({});
        const { fetchTaskByUid } = jest.requireMock(
            '../../../utils/tasksService'
        );
        fetchTaskByUid.mockResolvedValue({ ...task, status: 2 });
        render(<TaskModal isOpen onClose={jest.fn()} task={task} />);

        fireEvent.click(screen.getByTestId('task-complete-button'));

        await waitFor(() =>
            expect(toggleTaskCompletion).toHaveBeenCalledWith(
                't1',
                expect.objectContaining({ uid: 't1' })
            )
        );
        expect(updateTask).not.toHaveBeenCalled();
    });
});

describe('useTaskAutosave on a task mirrored from a TODO.md file', () => {
    const task = { id: 1, uid: 't1', name: 'A', source_key: 'abc' } as Task;

    it('refuses a save without running it, and runs an allowed one', async () => {
        const { result } = renderHook(() => useTaskAutosave(task));
        const op = jest.fn().mockResolvedValue(undefined);

        let refused = true;
        await act(async () => {
            refused = await result.current.run({ name: 'B' }, op);
        });
        expect(refused).toBe(false);
        expect(op).not.toHaveBeenCalled();
        expect(result.current.task.name).toBe('A');
        expect(showErrorToast).toHaveBeenCalledWith(
            'This comes from a TODO.md file. Edit the file instead.'
        );

        let allowed = false;
        await act(async () => {
            allowed = await result.current.run({}, op, {
                allowReadOnly: true,
            });
        });
        expect(allowed).toBe(true);
        expect(op).toHaveBeenCalledTimes(1);
    });
});

describe('TodoMdProjectNote', () => {
    it('shows the file path and rereads on demand', async () => {
        const onReread = jest.fn().mockResolvedValue(undefined);
        render(<TodoMdProjectNote path="alpha/TODO.md" onReread={onReread} />);

        expect(screen.getByText(/alpha\/TODO\.md/)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('todo-md-reread'));

        await screen.findByText('Reread');
        expect(onReread).toHaveBeenCalledTimes(1);
        expect(showSuccessToast).toHaveBeenCalledWith('TODO.md files reread.');
    });

    it('says so when the reread fails', async () => {
        const onReread = jest.fn().mockRejectedValue(new Error('no'));
        render(<TodoMdProjectNote path="alpha/TODO.md" onReread={onReread} />);

        fireEvent.click(screen.getByTestId('todo-md-reread'));

        await screen.findByText('Reread');
        expect(showErrorToast).toHaveBeenCalledWith(
            'Could not reread the TODO.md files.'
        );
    });
});

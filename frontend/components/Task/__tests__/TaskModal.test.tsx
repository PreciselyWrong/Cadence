import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskModal from '../TaskModal';
import {
    updateTask,
    fetchTaskByUid,
    toggleTaskCompletion,
} from '../../../utils/tasksService';
import { datePresets } from '../../../utils/datePresets';
import { analyzeInboxText } from '../../../utils/inboxService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));

const mockShowErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: mockShowErrorToast,
    }),
}));

jest.mock('../../Inbox/QuickCaptureInput', () => ({
    __esModule: true,
    default: ({ initialValue, onTextChange }: any) => (
        <input
            data-testid="task-name-input"
            defaultValue={initialValue}
            key={initialValue}
            onChange={(e) => onTextChange(e.target.value)}
        />
    ),
}));

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: any) => (
        <div data-testid="markdown-rendered">{content}</div>
    ),
}));

jest.mock('../../../utils/inboxService', () => ({
    analyzeInboxText: jest.fn(),
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
    default: ({ onQuickAdd }: any) => (
        <button
            type="button"
            data-testid="add-subtask"
            onClick={() => onQuickAdd('Buy hinges')}
        />
    ),
}));

jest.mock('../../../store/useStore', () => {
    const state: any = {
        projectsStore: { projects: [{ id: 7, name: 'Shed' }] },
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

const task: any = {
    id: 1,
    uid: 't-1',
    name: 'Fix the gate',
    note: '',
    status: 0,
    priority: 0,
    project_id: null,
    area_id: null,
    due_date: null,
    tags: [],
};

const renderPanel = () => {
    const onClose = jest.fn();
    render(<TaskModal isOpen onClose={onClose} task={task} />);
    return { onClose };
};

describe('TaskModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (analyzeInboxText as jest.Mock).mockImplementation(
            async (text: string) => ({
                cleaned_content: text,
                parsed_tags: [],
                parsed_projects: [],
                parsed_area: null,
                parsed_due_date: null,
            })
        );
        (updateTask as jest.Mock).mockResolvedValue({});
        (fetchTaskByUid as jest.Mock).mockResolvedValue({
            ...task,
            name: 'Fixed',
        });
    });

    it('saves the title when the box loses focus and shows Enregistré', async () => {
        renderPanel();

        const input = screen.getByTestId('task-name-input');
        fireEvent.change(input, { target: { value: 'Fixed the gate' } });
        fireEvent.blur(input);

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', {
                name: 'Fixed the gate',
            })
        );
        await waitFor(() =>
            expect(screen.getByTestId('task-save-state')).toHaveTextContent(
                'Saved'
            )
        );
        expect(screen.queryByTestId('task-save-button')).toBeNull();
    });

    it('does not save an unchanged title', () => {
        renderPanel();
        fireEvent.blur(screen.getByTestId('task-name-input'));
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('refuses an empty title without calling the API', async () => {
        renderPanel();
        const input = screen.getByTestId('task-name-input');
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.blur(input);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Task name is required'
        );
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('rolls a chip back and reports the failure when the save fails', async () => {
        (updateTask as jest.Mock).mockRejectedValue(new Error('boom'));
        renderPanel();

        fireEvent.click(screen.getByTestId('chip-priority'));
        fireEvent.click(screen.getByRole('option', { name: 'High' }));

        await waitFor(() =>
            expect(screen.getByTestId('task-save-state')).toHaveAttribute(
                'data-state',
                'error'
            )
        );
        expect(screen.getByTestId('chip-priority')).toHaveTextContent(
            'Priority'
        );
        expect(mockShowErrorToast).toHaveBeenCalled();
    });

    it('saves a priority chosen in its popover', async () => {
        (fetchTaskByUid as jest.Mock).mockResolvedValue({
            ...task,
            priority: 'high',
        });
        renderPanel();

        fireEvent.click(screen.getByTestId('chip-priority'));
        fireEvent.click(screen.getByRole('option', { name: 'High' }));

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', {
                priority: 'high',
            })
        );
        expect(screen.getByTestId('chip-priority')).toHaveTextContent('High');
    });

    it('saves the chosen project as project_id', async () => {
        renderPanel();

        fireEvent.click(screen.getByTestId('chip-project'));
        fireEvent.click(screen.getByRole('option', { name: 'Shed' }));

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', { project_id: 7 })
        );
    });

    it('picks a status from its popover', async () => {
        renderPanel();

        fireEvent.click(screen.getByTestId('chip-status'));
        fireEvent.click(screen.getByRole('option', { name: 'In progress' }));

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', { status: 1 })
        );
    });

    it('sets tomorrow from the date popover quick choices', async () => {
        renderPanel();

        fireEvent.click(screen.getByTestId('chip-due'));
        fireEvent.click(
            within(screen.getByRole('dialog', { name: 'Due' })).getByRole(
                'button',
                { name: /^Tomorrow/ }
            )
        );

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith(
                't-1',
                expect.objectContaining({
                    due_date: datePresets(new Date(), 1).tomorrow,
                })
            )
        );
    });

    it('refuses a start after the due date', async () => {
        render(
            <TaskModal
                isOpen
                onClose={jest.fn()}
                task={{ ...task, due_date: '2026-10-30' }}
            />
        );

        fireEvent.click(screen.getByTestId('chip-start'));
        fireEvent.click(
            within(screen.getByRole('dialog', { name: 'Start' })).getByRole(
                'button',
                { name: /Next week/ }
            )
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Start cannot be after the due date'
        );
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('edits the description in place and saves it on blur', async () => {
        render(
            <TaskModal
                isOpen
                onClose={jest.fn()}
                task={{ ...task, note: '**Call** the fencer' }}
            />
        );

        expect(screen.getByTestId('markdown-rendered')).toHaveTextContent(
            '**Call** the fencer'
        );
        fireEvent.click(screen.getByTestId('task-note-preview'));
        const box = screen.getByLabelText('Description');
        fireEvent.change(box, { target: { value: 'Call the fencer today' } });
        fireEvent.blur(box);

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', {
                note: 'Call the fencer today',
            })
        );
    });

    it('shows a placeholder for an empty description', () => {
        renderPanel();
        expect(
            screen.getByText('Add a description (Markdown)')
        ).toBeInTheDocument();
    });

    it('saves a description still being typed when Escape closes the panel', async () => {
        const { onClose } = renderPanel();

        fireEvent.click(screen.getByTestId('task-note-preview'));
        fireEvent.change(screen.getByLabelText('Description'), {
            target: { value: 'Typed, not blurred' },
        });
        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', {
                note: 'Typed, not blurred',
            })
        );
    });

    it('closes on Escape', async () => {
        const { onClose } = renderPanel();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('completes the task from the footer', async () => {
        (toggleTaskCompletion as jest.Mock).mockResolvedValue({});
        renderPanel();

        fireEvent.click(screen.getByTestId('task-complete-button'));
        await waitFor(() =>
            expect(toggleTaskCompletion).toHaveBeenCalledWith(
                't-1',
                expect.objectContaining({ uid: 't-1' })
            )
        );
    });

    it('shows subtasks, attachments and comments, and adds a subtask straight away', async () => {
        renderPanel();

        expect(screen.getByTestId('task-attachments')).toBeInTheDocument();
        expect(screen.getByTestId('task-comments')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('add-subtask'));
        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', {
                subtasks: [
                    expect.objectContaining({
                        name: 'Buy hinges',
                        parent_task_id: 1,
                    }),
                ],
            })
        );
    });

    it('moves typed #tags and +project out of the name on save', async () => {
        (analyzeInboxText as jest.Mock).mockResolvedValue({
            cleaned_content: 'Fix the shed door',
            parsed_tags: ['errand'],
            parsed_projects: ['Shed'],
            parsed_area: null,
            parsed_due_date: null,
        });
        renderPanel();

        const input = screen.getByTestId('task-name-input');
        fireEvent.change(input, {
            target: { value: 'Fix the shed door #errand +Shed' },
        });
        fireEvent.blur(input);

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t-1', {
                name: 'Fix the shed door',
                project_id: 7,
                tags: [{ name: 'errand' }],
            })
        );
    });
});

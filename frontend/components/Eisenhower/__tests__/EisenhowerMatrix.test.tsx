import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import EisenhowerMatrix from '../EisenhowerMatrix';
import MatrixEditorModal from '../MatrixEditorModal';
import { DEFAULT_MATRIX } from '../matrixRules';
import { fetchProfile, updateUiSettings } from '../../../utils/profileService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) => {
            const text =
                typeof fallback === 'string'
                    ? fallback
                    : (fallback?.defaultValue ?? key);
            return text.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
                String(fallback?.[k] ?? '')
            );
        },
    }),
}));

jest.mock('../../../utils/profileService', () => ({
    fetchProfile: jest.fn(),
    updateUiSettings: jest.fn(),
}));

jest.mock('../../../utils/csrfService', () => ({
    getCsrfToken: jest.fn().mockResolvedValue('token'),
}));

jest.mock('../../Task/TaskItem', () => ({
    __esModule: true,
    default: ({ task }: any) => <div data-testid="task">{task.name}</div>,
}));

const workMatrix = {
    id: 'work',
    name: 'Work',
    quadrants: [
        {
            name: 'Overdue',
            rule: {
                priorities: [],
                due: { type: 'overdue' },
                tags: [],
                projects: [],
            },
        },
        {
            name: 'High',
            rule: {
                priorities: ['high'],
                due: { type: 'any' },
                tags: [],
                projects: [],
            },
        },
        {
            name: 'Home',
            rule: {
                priorities: [],
                due: { type: 'any' },
                tags: ['home'],
                projects: [],
            },
        },
        {
            name: 'Rest',
            rule: {
                priorities: [],
                due: { type: 'any' },
                tags: [],
                projects: [],
            },
        },
    ],
};

const tasks = [
    { id: 1, uid: 'a', name: 'Late', priority: 2, due_date: '2000-01-01' },
    { id: 2, uid: 'b', name: 'Big', priority: 2 },
    { id: 3, uid: 'c', name: 'Chores', priority: 0, tags: [{ name: 'home' }] },
];

describe('EisenhowerMatrix', () => {
    beforeEach(() => {
        localStorage.clear();
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ tasks }),
        });
        (fetchProfile as jest.Mock).mockResolvedValue({
            ui_settings: { matrices: [workMatrix] },
        });
        (updateUiSettings as jest.Mock).mockImplementation(
            async (settings: any) => ({
                success: true,
                ui_settings: settings,
            })
        );
    });

    it('shows the built-in matrix without edit or delete', async () => {
        render(<EisenhowerMatrix />);
        await screen.findAllByTestId('task');
        expect(screen.getByText('Do Now')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Delete' })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit' })
        ).not.toBeInTheDocument();
    });

    it('switches to a custom matrix and places tasks by its rules', async () => {
        render(<EisenhowerMatrix />);
        await screen.findAllByTestId('task');
        await screen.findByRole('option', { name: 'Work' });

        fireEvent.change(screen.getByLabelText('Matrix'), {
            target: { value: 'work' },
        });

        const overdueCell = screen
            .getByText('Overdue')
            .closest('button')!.parentElement!;
        expect(within(overdueCell).getByText('Late')).toBeInTheDocument();
        expect(within(overdueCell).queryByText('Big')).not.toBeInTheDocument();
        const highCell = screen
            .getByText('High')
            .closest('button')!.parentElement!;
        expect(within(highCell).getByText('Big')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Edit' })
        ).toBeInTheDocument();
    });

    it('creates a new matrix and saves it to ui settings', async () => {
        render(<EisenhowerMatrix />);
        await screen.findByRole('option', { name: 'Work' });

        fireEvent.click(screen.getByRole('button', { name: 'New matrix' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Matrix name'), {
            target: { value: 'Focus week' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(updateUiSettings).toHaveBeenCalled());
        const saved = (updateUiSettings as jest.Mock).mock.calls[0][0];
        expect(saved.matrices).toHaveLength(2);
        expect(saved.matrices[1].name).toBe('Focus week');
        expect(saved.matrices[1].quadrants[0].rule.tags).toEqual(['urgent']);
        expect(
            await screen.findByRole('option', { name: 'Focus week' })
        ).toBeInTheDocument();
    });

    it('deletes a custom matrix after confirming', async () => {
        localStorage.setItem('eisenhower.activeMatrix', 'work');
        render(<EisenhowerMatrix />);
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
        const buttons = screen.getAllByRole('button', { name: 'Delete' });
        fireEvent.click(buttons[buttons.length - 1]);

        await waitFor(() =>
            expect(updateUiSettings).toHaveBeenCalledWith({ matrices: [] })
        );
        expect(screen.getByText('Do Now')).toBeInTheDocument();
    });
});

describe('MatrixEditorModal', () => {
    it('edits quadrant names and rules', () => {
        const onSave = jest.fn();
        render(
            <MatrixEditorModal
                matrix={{ ...DEFAULT_MATRIX, id: 'x', name: 'Mine' }}
                projects={[{ id: 1, uid: 'p1', name: 'Garden' } as any]}
                onSave={onSave}
                onCancel={jest.fn()}
            />
        );
        const names = screen.getAllByLabelText('Quadrant name');
        fireEvent.change(names[3], { target: { value: 'Someday' } });
        fireEvent.click(screen.getAllByLabelText('low')[3]);
        fireEvent.change(screen.getAllByRole('combobox')[3], {
            target: { value: 'within' },
        });
        fireEvent.change(screen.getByLabelText('Days'), {
            target: { value: '3' },
        });
        fireEvent.change(
            screen.getAllByLabelText('Tags (any of, comma separated)')[3],
            { target: { value: 'Home, errands ' } }
        );
        fireEvent.click(screen.getAllByLabelText('Garden')[3]);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(onSave).toHaveBeenCalledTimes(1);
        const q = onSave.mock.calls[0][0].quadrants[3];
        expect(q).toEqual({
            name: 'Someday',
            rule: {
                priorities: ['low'],
                due: { type: 'within', days: 3 },
                tags: ['home', 'errands'],
                projects: ['p1'],
            },
        });
    });
});

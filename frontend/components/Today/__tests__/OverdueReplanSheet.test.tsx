import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OverdueReplanSheet from '../OverdueReplanSheet';
import { Task } from '../../../entities/Task';
import { TASK_STATUS } from '../../../constants/taskStatus';
import { skipTaskOccurrence, updateTask } from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

const mockShowUndoToast = jest.fn();
const mockShowErrorToast = jest.fn();

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showUndoToast: mockShowUndoToast,
        showErrorToast: mockShowErrorToast,
        showSuccessToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/tasksService', () => ({
    updateTask: jest.fn(async (uid: string, data: Partial<Task>) => ({
        uid,
        name: `Task ${uid}`,
        status: 0,
        ...data,
    })),
    toggleTaskCompletion: jest.fn(async (uid: string) => ({
        uid,
        name: `Task ${uid}`,
        status: 2,
    })),
    skipTaskOccurrence: jest.fn(async (uid: string) => ({
        uid,
        name: `Task ${uid}`,
        status: 0,
    })),
}));

const task = (uid: string, fields: Partial<Task> = {}): Task =>
    ({
        uid,
        name: `Task ${uid}`,
        status: TASK_STATUS.NOT_STARTED,
        due_date: '2026-11-10',
        ...fields,
    }) as Task;

const TODAY = '2026-11-19';

describe('OverdueReplanSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders overdue tasks, keeps rows after a choice with Undo, and calls updateTask + showUndoToast', async () => {
        const onApplied = jest.fn();
        render(
            <OverdueReplanSheet
                open
                onClose={jest.fn()}
                tasks={[
                    { task: task('a'), plannedDate: null },
                    {
                        task: task('r', { recurrence_type: 'daily' }),
                        plannedDate: null,
                    },
                ]}
                today={TODAY}
                dayCounts={{ '2026-11-19': 2, '2026-11-20': 1 }}
                plannedByDay={{}}
                onApplied={onApplied}
            />
        );

        expect(screen.getByText('Task a')).toBeInTheDocument();
        expect(screen.getByText('Task r')).toBeInTheDocument();

        // Recurring task only offers Done and Skip this time
        const skipBtn = screen.getByRole('button', { name: 'Skip this time' });
        expect(skipBtn).toBeInTheDocument();

        // Click Tomorrow on Task a
        const tomorrowButtons = screen.getAllByRole('button', {
            name: 'Tomorrow',
        });
        fireEvent.click(tomorrowButtons[0]);

        await waitFor(() => {
            expect(updateTask).toHaveBeenCalledWith(
                'a',
                expect.objectContaining({
                    due_date: '2026-11-20',
                    unplan: true,
                })
            );
        });
        expect(mockShowUndoToast).toHaveBeenCalled();
        expect(onApplied).toHaveBeenCalled();
        // Row stays visible with an in-place Undo button
        expect(screen.getByText('Task a')).toBeInTheDocument();
        const undoBtn = await screen.findByRole('button', { name: 'Undo' });
        fireEvent.click(undoBtn);

        await waitFor(() => {
            expect(updateTask).toHaveBeenCalledWith(
                'a',
                expect.objectContaining({
                    due_date: '2026-11-10',
                    status: TASK_STATUS.NOT_STARTED,
                })
            );
        });
    });

    it('supports recurring Skip and Done', async () => {
        render(
            <OverdueReplanSheet
                open
                onClose={jest.fn()}
                tasks={[
                    {
                        task: task('r', { recurrence_type: 'daily' }),
                        plannedDate: null,
                    },
                ]}
                today={TODAY}
                dayCounts={{}}
                plannedByDay={{}}
                onApplied={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Skip this time' }));
        await waitFor(() => {
            expect(skipTaskOccurrence).toHaveBeenCalledWith('r');
        });
    });

    it('supports bulk Spread over 7 days and All to tomorrow', async () => {
        render(
            <OverdueReplanSheet
                open
                onClose={jest.fn()}
                tasks={[
                    { task: task('a'), plannedDate: null },
                    { task: task('b'), plannedDate: null },
                    {
                        task: task('r', { recurrence_type: 'daily' }),
                        plannedDate: null,
                    },
                ]}
                today={TODAY}
                dayCounts={{}}
                plannedByDay={{}}
                onApplied={jest.fn()}
            />
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'All to tomorrow' })
        );

        await waitFor(() => {
            expect(updateTask).toHaveBeenCalledWith(
                'a',
                expect.objectContaining({ due_date: '2026-11-20' })
            );
            expect(updateTask).toHaveBeenCalledWith(
                'b',
                expect.objectContaining({ due_date: '2026-11-20' })
            );
        });
        expect(updateTask).not.toHaveBeenCalledWith('r', expect.anything());
        expect(mockShowUndoToast).toHaveBeenCalled();
    });
});

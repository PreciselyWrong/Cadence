import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ArrangePanel, { arrangeTasks } from '../Calendar/ArrangePanel';

const tasks = [
    {
        id: 1,
        name: 'Undated',
        status: 0,
        due_date: null,
        project: { name: 'Home' },
    },
    { id: 2, name: 'Late', status: 0, due_date: '2026-10-20', priority: 2 },
    { id: 3, name: 'Future', status: 0, due_date: '2026-11-20' },
    { id: 4, name: 'Done undated', status: 2, due_date: null },
    {
        id: 5,
        name: 'Cancelled late',
        status: 'cancelled',
        due_date: '2026-10-01',
    },
    {
        id: 6,
        name: 'Preview',
        status: 0,
        due_date: '2026-10-21',
        is_virtual_occurrence: true,
    },
    { id: 7, name: 'Subtask', status: 0, due_date: null, parent_task_id: 1 },
    {
        id: 8,
        name: 'Tagged',
        status: 'not_started',
        due_date: null,
        tags: [{ name: 'deep' }],
    },
];

describe('arrangeTasks', () => {
    it('lists open undated tasks for the No date tab', () => {
        expect(
            arrangeTasks(tasks, 'nodate', '2026-10-29').map((t) => t.id)
        ).toEqual([1, 8]);
    });

    it('lists open tasks due before today for the Overdue tab', () => {
        expect(
            arrangeTasks(tasks, 'overdue', '2026-10-29').map((t) => t.id)
        ).toEqual([2]);
    });

    it('filters by project, tag and priority', () => {
        const run = (filter: any, tab: any = 'nodate') =>
            arrangeTasks(tasks, tab, '2026-10-29', {
                project: '',
                tag: '',
                priority: '',
                ...filter,
            }).map((t) => t.id);
        expect(run({ project: 'Home' })).toEqual([1]);
        expect(run({ tag: 'deep' })).toEqual([8]);
        expect(run({ priority: 'high' }, 'overdue')).toEqual([2]);
        expect(run({ priority: 'low' }, 'overdue')).toEqual([]);
    });
});

describe('ArrangePanel', () => {
    it('drags a task with its arrange id', () => {
        render(<ArrangePanel tasks={tasks} onClose={jest.fn()} />);
        const setData = jest.fn();
        fireEvent.dragStart(screen.getByTitle('Undated'), {
            dataTransfer: { setData, effectAllowed: '' },
        });
        expect(setData).toHaveBeenCalledWith('text/plain', 'arrange-1');
    });

    it('collapses a project group', () => {
        render(<ArrangePanel tasks={tasks} onClose={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Home/ }));
        expect(screen.queryByTitle('Undated')).not.toBeInTheDocument();
    });
});

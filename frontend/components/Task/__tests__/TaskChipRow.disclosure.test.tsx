import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskChipRow from '../TaskChipRow';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, d: string) => d,
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../utils/dateUtils', () => ({
    getTodayDateString: () => '2030-03-15',
    getUserTimezone: () => 'UTC',
}));

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: (s: any) => unknown) =>
        selector({
            projectsStore: { projects: [] },
            areasStore: { areas: [] },
            tagsStore: { tags: [] },
        }),
}));

const noop = () => undefined;

const renderRow = (task: Partial<Task>) =>
    render(
        <TaskChipRow
            task={{ id: 1, uid: 'u1', name: 'A', status: 0, ...task } as Task}
            people={[]}
            onDue={noop}
            onStart={noop}
            onDefer={noop}
            onReminder={noop}
            onPriority={noop}
            onProject={noop}
            onArea={noop}
            onTags={noop}
            onStatus={noop}
            onRecurrence={noop}
            onEstimate={noop}
            onAssignee={noop}
        />
    );

const SECONDARY = [
    'chip-start',
    'chip-priority',
    'chip-area',
    'chip-status',
    'chip-recurrence',
    'chip-estimate',
    'chip-defer',
    'chip-reminder',
    'chip-tags',
];

// A simple task stays simple: the panel shows the date and project, plus
// any field that already has a value (tags included); the rest waits
// behind More.
describe('TaskChipRow progressive disclosure', () => {
    it('shows only the core chips on an empty task', () => {
        renderRow({});

        expect(screen.getByTestId('chip-due')).toBeInTheDocument();
        expect(screen.getByTestId('chip-project')).toBeInTheDocument();
        SECONDARY.forEach((id) =>
            expect(screen.queryByTestId(id)).not.toBeInTheDocument()
        );
    });

    it('opens every field with More', () => {
        renderRow({});

        fireEvent.click(screen.getByRole('button', { name: 'More' }));

        SECONDARY.forEach((id) =>
            expect(screen.getByTestId(id)).toBeInTheDocument()
        );
        expect(
            screen.queryByRole('button', { name: 'More' })
        ).not.toBeInTheDocument();
    });

    it('shows the tags once the task has one', () => {
        renderRow({ tags: [{ name: 'home' }] });

        expect(screen.getByTestId('chip-tags')).toHaveTextContent('#home');
    });

    it('shows a field that has a value without opening More', () => {
        renderRow({ priority: 'high', estimated_minutes: 30, status: 1 });

        expect(screen.getByTestId('chip-priority')).toBeInTheDocument();
        expect(screen.getByTestId('chip-estimate')).toBeInTheDocument();
        expect(screen.getByTestId('chip-status')).toBeInTheDocument();
        expect(screen.queryByTestId('chip-start')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'More' })
        ).toBeInTheDocument();
    });

    // The API sends priority as a number; 0 is also the column default.
    it('shows a numeric priority from the API as its name', () => {
        renderRow({ priority: 2 });

        expect(screen.getByTestId('chip-priority')).toHaveTextContent('High');
    });

    it('treats the default priority 0 as no priority', () => {
        renderRow({ priority: 0 });

        expect(screen.queryByTestId('chip-priority')).not.toBeInTheDocument();
    });

    it('shows a past due date like any set date, without red', () => {
        renderRow({ due_date: '2030-03-01' });

        const due = screen.getByTestId('chip-due');
        expect(due.className).not.toMatch(/red/);
        expect(due).toHaveClass('bg-indigo-50');
    });
});

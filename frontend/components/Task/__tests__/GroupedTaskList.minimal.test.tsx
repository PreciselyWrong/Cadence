import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupedTaskList from '../GroupedTaskList';
import { Task } from '../../../entities/Task';
import { useIsMinimal } from '../../../hooks/useUiDensity';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: jest.fn(),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('../TaskItem', () => ({
    __esModule: true,
    default: ({ task }: { task: Task }) => <div>{task.name}</div>,
}));

const STORAGE_KEY = 'tududi.collapsedTaskGroups';

const projects = [
    { id: 5, uid: 'p5', name: 'Alpha' },
    { id: 6, uid: 'p6', name: 'Beta' },
] as any;

const makeTask = (overrides: Partial<Task>): Task =>
    ({
        id: 1,
        uid: 'uid-1',
        name: 'Task',
        status: 'not_started',
        priority: 'low',
        ...overrides,
    }) as Task;

const tasks = [
    makeTask({ id: 1, uid: 'u1', name: 'Alpha one', project_id: 5 }),
    makeTask({ id: 2, uid: 'u2', name: 'Beta one', project_id: 6 }),
];

const renderGrouped = () =>
    render(
        <GroupedTaskList
            tasks={tasks}
            onTaskUpdate={jest.fn()}
            onTaskDelete={jest.fn()}
            projects={projects}
            groupBy="project"
        />
    );

describe('GroupedTaskList project headers in minimal mode', () => {
    beforeEach(() => {
        window.localStorage.clear();
        (useIsMinimal as jest.Mock).mockReturnValue(true);
    });

    it('hides a group when its header is clicked and shows it again', () => {
        renderGrouped();

        const header = screen.getByRole('button', { name: /Alpha/ });
        expect(header).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Alpha one')).toBeInTheDocument();

        fireEvent.click(header);
        expect(screen.queryByText('Alpha one')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Alpha/ })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        // The other group is untouched.
        expect(screen.getByText('Beta one')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
        expect(screen.getByText('Alpha one')).toBeInTheDocument();
    });

    it('remembers a collapsed group per list in localStorage', () => {
        const { unmount } = renderGrouped();
        fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
        unmount();

        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
        const lists = Object.values(stored) as string[][];
        expect(lists.some((groups) => groups.includes('id-5'))).toBe(true);

        renderGrouped();
        expect(screen.queryByText('Alpha one')).not.toBeInTheDocument();
        expect(screen.getByText('Beta one')).toBeInTheDocument();
    });

    it('still toggles the group when localStorage is unreadable', () => {
        const getItem = jest
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        const setItem = jest
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });

        renderGrouped();
        expect(screen.getByText('Alpha one')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
        expect(screen.queryByText('Alpha one')).not.toBeInTheDocument();

        getItem.mockRestore();
        setItem.mockRestore();
    });
});

describe('GroupedTaskList project headers in dense mode', () => {
    beforeEach(() => {
        window.localStorage.clear();
        (useIsMinimal as jest.Mock).mockReturnValue(false);
    });

    it('keeps the header as plain text with no toggle', () => {
        renderGrouped();

        const header = screen.getByText('Alpha').closest('div');
        expect(header).not.toBeNull();
        expect(within(header!).queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Alpha/ })).toBeNull();

        fireEvent.click(screen.getByText('Alpha'));
        expect(screen.getByText('Alpha one')).toBeInTheDocument();
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
});

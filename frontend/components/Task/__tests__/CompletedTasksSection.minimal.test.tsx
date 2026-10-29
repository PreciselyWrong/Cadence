import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CompletedTasksSection, {
    useCompletedTasks,
} from '../CompletedTasksSection';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

const STORAGE_KEY = 'tududi.completedOpen.tasks';

describe('CompletedTasksSection', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('is collapsed by default and shows the count in the header', () => {
        render(
            <CompletedTasksSection list="tasks" count={3}>
                <div>Finished task</div>
            </CompletedTasksSection>
        );

        const toggle = screen.getByTestId('completed-tasks-toggle');
        expect(toggle).toHaveTextContent('Completed (3)');
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Finished task')).not.toBeInTheDocument();
    });

    it('expands on click and collapses again on a second click', () => {
        render(
            <CompletedTasksSection list="tasks" count={1}>
                <div>Finished task</div>
            </CompletedTasksSection>
        );
        const toggle = screen.getByTestId('completed-tasks-toggle');

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Finished task')).toBeInTheDocument();

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Finished task')).not.toBeInTheDocument();
    });

    it('remembers the open state per list', () => {
        const { unmount } = render(
            <CompletedTasksSection list="tasks" count={1}>
                <div>Finished task</div>
            </CompletedTasksSection>
        );
        fireEvent.click(screen.getByTestId('completed-tasks-toggle'));
        expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
        unmount();

        render(
            <CompletedTasksSection list="tasks" count={1}>
                <div>Finished task</div>
            </CompletedTasksSection>
        );
        expect(screen.getByText('Finished task')).toBeInTheDocument();
    });

    it('keeps another list collapsed', () => {
        localStorage.setItem('tududi.completedOpen.project:abc', '1');
        render(
            <CompletedTasksSection list="tasks" count={1}>
                <div>Finished task</div>
            </CompletedTasksSection>
        );
        expect(screen.queryByText('Finished task')).not.toBeInTheDocument();
    });

    it('still works when localStorage throws', () => {
        const getSpy = jest
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        const setSpy = jest
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });

        render(
            <CompletedTasksSection list="tasks" count={1}>
                <div>Finished task</div>
            </CompletedTasksSection>
        );
        const toggle = screen.getByTestId('completed-tasks-toggle');
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle);
        expect(screen.getByText('Finished task')).toBeInTheDocument();

        getSpy.mockRestore();
        setSpy.mockRestore();
    });
});

describe('useCompletedTasks', () => {
    const Probe: React.FC<{
        enabled: boolean;
        load: () => Promise<Task[]>;
        refreshKey: string;
    }> = ({ enabled, load, refreshKey }) => {
        const [tasks] = useCompletedTasks(enabled, load, refreshKey);
        return <div data-testid="count">{tasks.length}</div>;
    };

    it('does not load while disabled', () => {
        const load = jest.fn().mockResolvedValue([]);
        render(<Probe enabled={false} load={load} refreshKey="a" />);
        expect(load).not.toHaveBeenCalled();
    });

    it('loads when enabled and reloads when the refresh key changes', async () => {
        const load = jest
            .fn()
            .mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as Task[])
            .mockResolvedValueOnce([{ id: 1 }] as Task[]);
        const { rerender } = render(
            <Probe enabled load={load} refreshKey="a" />
        );

        await waitFor(() =>
            expect(screen.getByTestId('count')).toHaveTextContent('2')
        );
        rerender(<Probe enabled load={load} refreshKey="b" />);
        await waitFor(() =>
            expect(screen.getByTestId('count')).toHaveTextContent('1')
        );
        expect(load).toHaveBeenCalledTimes(2);
    });
});

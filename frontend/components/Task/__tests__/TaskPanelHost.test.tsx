import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TaskPanelHost from '../TaskPanelHost';
import { TaskPaneProvider } from '../../../contexts/TaskPaneContext';
import { openTaskPanel, useTaskPanel } from '../../../store/taskPanelStore';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));
jest.mock('../../../utils/tasksService', () => ({
    fetchTaskByUid: jest.fn(async (uid: string) => ({ uid, name: 'Task' })),
}));
jest.mock('../TaskModal', () => ({
    __esModule: true,
    default: () => <div data-testid="task-modal" />,
}));

const LocationProbe = () => (
    <div data-testid="search">{useLocation().search}</div>
);

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <TaskPaneProvider>
                <TaskPanelHost />
                <LocationProbe />
            </TaskPaneProvider>
        </MemoryRouter>
    );

describe('TaskPanelHost', () => {
    afterEach(() => act(() => useTaskPanel.getState().close()));

    it('sends a task opened by uid to the floating sheet', async () => {
        renderAt('/inbox');
        act(() => openTaskPanel('t1'));

        await waitFor(() =>
            expect(screen.getByTestId('search')).toHaveTextContent('?task=t1')
        );
        expect(screen.queryByTestId('task-modal')).toBeNull();
        expect(useTaskPanel.getState().uid).toBeNull();
    });

    it('keeps the dialog for one occurrence of a series', async () => {
        renderAt('/inbox');
        act(() => openTaskPanel('t1', '2026-11-20'));

        expect(await screen.findByTestId('task-modal')).toBeInTheDocument();
        expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
    });

    it('keeps the dialog on a task page, where the sheet does not show', async () => {
        renderAt('/task/other');
        act(() => openTaskPanel('t1'));

        expect(await screen.findByTestId('task-modal')).toBeInTheDocument();
    });
});

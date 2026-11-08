import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnsortedTasks from '../UnsortedTasks';
import { fetchTasks } from '../../../utils/tasksService';
import { decideTask } from '../../../utils/reviewService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));
jest.mock('../../Shared/ToastContext', () => {
    const toast = { showErrorToast: jest.fn(), showSuccessToast: jest.fn() };
    return { useToast: () => toast };
});
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: jest.fn(),
}));
jest.mock('../../../utils/tasksService', () => ({
    fetchTasks: jest.fn(),
}));
jest.mock('../../../utils/reviewService', () => ({
    decideTask: jest.fn(),
}));

const TASKS = [
    {
        uid: 't-filed',
        name: 'Cours de kick-boxing',
        needs_when: true,
        Area: { uid: 'a1', name: 'Famille et Social' },
    },
    { uid: 't-loose', name: 'Rappeler le garage', needs_when: false },
];

describe('UnsortedTasks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchTasks as jest.Mock).mockResolvedValue({ tasks: TASKS });
        (decideTask as jest.Mock).mockResolvedValue({});
    });

    it('lists the tasks to sort, with « When? » only on the filed one', async () => {
        render(<UnsortedTasks />);
        expect(
            await screen.findByText('Cours de kick-boxing')
        ).toBeInTheDocument();
        expect(screen.getByText('Rappeler le garage')).toBeInTheDocument();
        expect(screen.getByText('Famille et Social')).toBeInTheDocument();
        expect(fetchTasks).toHaveBeenCalledWith('?type=unsorted');
        expect(screen.getAllByRole('group', { name: 'Quand ?' })).toHaveLength(
            1
        );
    });

    it('settles the moment and takes the task out of the list', async () => {
        render(<UnsortedTasks />);
        await screen.findByText('Cours de kick-boxing');

        fireEvent.click(screen.getByRole('button', { name: 'Cette semaine' }));
        await waitFor(() =>
            expect(decideTask).toHaveBeenCalledWith('t-filed', {
                week_of: 'this_week',
            })
        );
        await waitFor(() =>
            expect(
                screen.queryByText('Cours de kick-boxing')
            ).not.toBeInTheDocument()
        );
    });

    it('keeps a task without a date when asked', async () => {
        render(<UnsortedTasks />);
        await screen.findByText('Cours de kick-boxing');
        fireEvent.click(screen.getByRole('button', { name: 'Sans date' }));
        await waitFor(() =>
            expect(decideTask).toHaveBeenCalledWith('t-filed', {
                needs_when: false,
            })
        );
    });

    it('shows nothing when there is nothing to sort', async () => {
        (fetchTasks as jest.Mock).mockResolvedValue({ tasks: [] });
        const { container } = render(<UnsortedTasks />);
        await waitFor(() => expect(fetchTasks).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});

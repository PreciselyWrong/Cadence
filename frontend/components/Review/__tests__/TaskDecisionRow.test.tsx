import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskDecisionRow from '../TaskDecisionRow';
import * as reviewService from '../../../utils/reviewService';
import { Task } from '../../../entities/Task';

jest.mock('../../../utils/reviewService', () => ({
    decideTask: jest.fn(),
    isParked: (task: any) =>
        (task.tags || []).some((tag: any) => tag.name === 'someday'),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

const mocked = reviewService as jest.Mocked<typeof reviewService>;

describe('TaskDecisionRow', () => {
    it('puts a task in view and shows no review date until parked', async () => {
        const task = { uid: 't1', name: 'Idea', tags: [] } as unknown as Task;
        mocked.decideTask.mockResolvedValue({ ...task, in_view: true });
        const onSaved = jest.fn().mockResolvedValue(undefined);
        render(<TaskDecisionRow task={task} onSaved={onSaved} />);
        expect(screen.queryByText('Review on')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'In view' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('t1', {
                in_view: true,
            })
        );
        expect(onSaved).toHaveBeenCalledWith(
            expect.objectContaining({ in_view: true })
        );
    });

    it('offers a review date and a way back for a parked task', async () => {
        const task = {
            uid: 't2',
            name: 'Parked',
            tags: [{ name: 'someday' }],
        } as unknown as Task;
        mocked.decideTask.mockResolvedValue(task);
        render(<TaskDecisionRow task={task} onSaved={jest.fn()} />);
        expect(screen.getByText('Review on')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'In view' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Later' }));
        await waitFor(() =>
            expect(mocked.decideTask).toHaveBeenCalledWith('t2', {
                later: false,
                review_on: null,
            })
        );
    });
});

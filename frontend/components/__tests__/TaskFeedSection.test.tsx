import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskFeedSection from '../CalendarFeeds/TaskFeedSection';

jest.mock('../../utils/taskFeedService', () => ({
    fetchTaskFeed: jest.fn().mockResolvedValue({ enabled: false }),
    createTaskFeed: jest
        .fn()
        .mockResolvedValue({ enabled: true, path: '/feeds/tasks/tf_x.ics' }),
    disableTaskFeed: jest.fn().mockResolvedValue({ enabled: false }),
    taskFeedUrl: (path: string) => `https://example.test/api${path}`,
}));

jest.mock('../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

describe('TaskFeedSection', () => {
    it('shows the new address once it is made, then can turn it off', async () => {
        render(<TaskFeedSection />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Make an address' })
        );

        expect(await screen.findByLabelText('Feed address')).toHaveValue(
            'https://example.test/api/feeds/tasks/tf_x.ics'
        );
        expect(
            screen.getByRole('button', { name: 'Make a new address' })
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
        expect(
            await screen.findByRole('button', { name: 'Make an address' })
        ).toBeInTheDocument();
        expect(screen.queryByLabelText('Feed address')).not.toBeInTheDocument();
    });
});

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

describe('TaskChipRow reminder', () => {
    it('keeps the reminder behind More until it is set', () => {
        renderRow({});

        expect(screen.queryByTestId('chip-reminder')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'More' }));

        expect(screen.getByTestId('chip-reminder')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'More' })
        ).not.toBeInTheDocument();
    });

    it('shows a set reminder without opening More', () => {
        renderRow({ reminder_at: '2030-03-15T08:00:00.000Z' });

        expect(screen.getByTestId('chip-reminder')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'More' })
        ).not.toBeInTheDocument();
    });
});

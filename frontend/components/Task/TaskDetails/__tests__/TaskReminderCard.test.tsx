import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskReminderCard from '../TaskReminderCard';
import { Task } from '../../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));

jest.mock('../../../Shared/DateTimePicker', () => ({
    __esModule: true,
    default: ({ onChange }: { onChange: (v: string) => void }) => (
        <button onClick={() => onChange('2030-03-15T08:00:00.000Z')}>
            pick
        </button>
    ),
}));

jest.mock('../../../../utils/dateUtils', () => ({
    getUserTimezone: () => 'UTC',
    formatDateTimeByCountry: () => '15 Mar 2030 08:00',
}));

const base = {
    isEditing: false,
    editedReminder: '',
    onChangeDateTime: jest.fn(),
    onStartEdit: jest.fn(),
    onSave: jest.fn(),
    onCancel: jest.fn(),
};

describe('TaskReminderCard', () => {
    beforeEach(() => jest.clearAllMocks());

    it('says there is no reminder, and starts editing on click', () => {
        render(<TaskReminderCard task={{ id: 1 } as Task} {...base} />);

        fireEvent.click(screen.getByText('No reminder'));
        expect(base.onStartEdit).toHaveBeenCalled();
    });

    it('shows the reminder time', () => {
        render(
            <TaskReminderCard
                task={
                    { id: 1, reminder_at: '2030-03-15T08:00:00.000Z' } as Task
                }
                {...base}
            />
        );
        expect(screen.getByText('15 Mar 2030 08:00')).toBeInTheDocument();
    });

    it('passes the picked time up and saves', () => {
        render(
            <TaskReminderCard task={{ id: 1 } as Task} {...base} isEditing />
        );

        fireEvent.click(screen.getByText('pick'));
        expect(base.onChangeDateTime).toHaveBeenCalledWith(
            '2030-03-15T08:00:00.000Z'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(base.onSave).toHaveBeenCalled();
    });
});

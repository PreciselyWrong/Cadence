import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskDueDateCard from '../TaskDueDateCard';
import { Task } from '../../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: any, options?: any) =>
            typeof fallback === 'string'
                ? fallback.replace(
                      /\{\{(\w+)\}\}/g,
                      (_: string, name: string) => options?.[name] ?? ''
                  )
                : _key,
    }),
}));

jest.mock('../../TaskForm/TaskDueDateSection', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../../../utils/dateUtils', () => ({
    parseDateString: (value: string) => new Date(`${value}T00:00:00`),
    formatDateByCountry: (date: Date) => date.toISOString().slice(0, 10),
    getUserTimezone: () => 'UTC',
}));
jest.mock('../../../../utils/localeUtils', () => ({
    getCountryFromTimezone: () => 'CH',
}));

const noop = () => undefined;

const renderCard = (due_date: string) =>
    render(
        <TaskDueDateCard
            task={
                {
                    id: 1,
                    uid: 'u1',
                    name: 'Pay the bill',
                    status: 0,
                    due_date,
                } as Task
            }
            isEditing={false}
            editedDueDate=""
            onChangeDate={noop}
            editedDueTime=""
            onChangeTime={noop}
            onStartEdit={noop}
            onSave={noop}
            onCancel={noop}
        />
    );

describe('TaskDueDateCard', () => {
    it('shows a past due date calmly: no day count, no red, no warning', () => {
        const { container } = renderCard('2001-03-05');

        expect(screen.queryByText(/days ago/)).not.toBeInTheDocument();
        expect(container.innerHTML).not.toMatch(/red-/);
    });

    it('still says how far away a future date is', () => {
        const future = new Date();
        future.setDate(future.getDate() + 3);
        renderCard(future.toISOString().slice(0, 10));

        expect(screen.getByText('(in 3 days)')).toBeInTheDocument();
    });
});

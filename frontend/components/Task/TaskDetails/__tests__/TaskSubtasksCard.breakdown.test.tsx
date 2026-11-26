import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskSubtasksCard from '../TaskSubtasksCard';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));
jest.mock('../../TaskItem', () => ({
    __esModule: true,
    default: () => null,
}));

const props = {
    subtasks: [],
    projects: [],
    onSubtaskUpdate: jest.fn(),
    onSubtaskDelete: jest.fn(),
    onQuickAdd: jest.fn(),
};

describe('TaskSubtasksCard breakdown action', () => {
    it('offers « Découper en étapes » only when the task can be split', () => {
        const onBreakdown = jest.fn();
        const { rerender } = render(
            <TaskSubtasksCard {...props} onBreakdown={onBreakdown} />
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Découper en étapes' })
        );
        expect(onBreakdown).toHaveBeenCalledTimes(1);

        rerender(<TaskSubtasksCard {...props} />);
        expect(
            screen.queryByRole('button', { name: 'Découper en étapes' })
        ).not.toBeInTheDocument();
    });
});

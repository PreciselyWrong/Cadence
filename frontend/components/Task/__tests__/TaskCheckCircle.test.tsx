import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskCheckCircle, { CHECK_DELAY_MS } from '../TaskCheckCircle';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fb?: string) => fb ?? _key }),
}));

const task = { id: 1, uid: 'u1', name: 'x', status: 'not_started' } as Task;

const setReducedMotion = (reduced: boolean) => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: reduced && query.includes('reduce'),
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
};

describe('TaskCheckCircle', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('collapses the row, then toggles after the animation', () => {
        setReducedMotion(false);
        const onToggle = jest.fn();
        render(
            <div data-task-row="" data-testid="row">
                <TaskCheckCircle task={task} onToggle={onToggle} />
            </div>
        );
        fireEvent.click(screen.getByTestId('task-check-circle'));
        expect(screen.getByRole('checkbox')).toBeChecked();
        expect(onToggle).not.toHaveBeenCalled();
        act(() => {
            jest.advanceTimersByTime(CHECK_DELAY_MS - 1);
        });
        expect(onToggle).not.toHaveBeenCalled();
        expect(screen.getByTestId('row').style.opacity).toBe('0');
        act(() => {
            jest.advanceTimersByTime(1);
        });
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('skips the motion under prefers-reduced-motion', () => {
        setReducedMotion(true);
        const onToggle = jest.fn();
        render(
            <div data-task-row="" data-testid="row">
                <TaskCheckCircle task={task} onToggle={onToggle} />
            </div>
        );
        fireEvent.click(screen.getByTestId('task-check-circle'));
        act(() => {
            jest.advanceTimersByTime(250);
        });
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('row').style.opacity).toBe('');
    });
});

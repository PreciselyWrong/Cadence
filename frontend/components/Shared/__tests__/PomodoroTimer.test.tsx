import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PomodoroTimer from '../PomodoroTimer';
import { recordFocusSession } from '../../../utils/focusSessionsService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../../utils/focusSessionsService', () => ({
    recordFocusSession: jest.fn().mockResolvedValue({}),
}));

describe('PomodoroTimer focus sessions', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        (recordFocusSession as jest.Mock).mockClear();
    });
    afterEach(() => jest.useRealTimers());

    const start = (container: HTMLElement) => {
        fireEvent.click(container.firstChild as HTMLElement);
        fireEvent.click(screen.getByLabelText('pomodoro.play'));
    };
    const tick = (seconds: number) => {
        for (let i = 0; i < seconds; i++) {
            act(() => {
                jest.advanceTimersByTime(1000);
            });
        }
    };

    it('saves a finished session once', () => {
        const { container } = render(<PomodoroTimer />);
        start(container);
        tick(25 * 60 + 5);
        expect(recordFocusSession).toHaveBeenCalledTimes(1);
        expect(recordFocusSession).toHaveBeenCalledWith({
            duration_seconds: 1500,
        });
    });

    it('keeps a session stopped after five minutes, not a shorter one', () => {
        const { container } = render(<PomodoroTimer />);
        start(container);
        tick(2 * 60);
        fireEvent.click(screen.getByLabelText('pomodoro.reset'));
        expect(recordFocusSession).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText('pomodoro.play'));
        tick(6 * 60);
        fireEvent.click(screen.getByLabelText('pomodoro.reset'));
        expect(recordFocusSession).toHaveBeenCalledWith({
            duration_seconds: 360,
        });
    });

    it('does not save again after a reload of a finished timer', () => {
        localStorage.setItem(
            'tududi_pomodoro_timer',
            JSON.stringify({ isActive: true, timeLeft: 0, isRunning: false })
        );
        render(<PomodoroTimer />);
        tick(2);
        expect(recordFocusSession).not.toHaveBeenCalled();
    });
});

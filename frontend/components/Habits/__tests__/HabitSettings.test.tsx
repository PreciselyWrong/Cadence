import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HabitSettings, { settingsFromHabit } from '../HabitSettings';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

const values = settingsFromHabit({
    habit_mode: true,
    habit_target_count: 1,
} as Task);

describe('HabitSettings target count', () => {
    it('reports a typed count without waiting for blur when live', () => {
        const onChange = jest.fn();
        render(
            <HabitSettings
                values={values}
                firstDayOfWeek={1}
                onChange={onChange}
                liveCounts
            />
        );
        fireEvent.change(screen.getByLabelText('Times'), {
            target: { value: '2' },
        });
        expect(onChange).toHaveBeenCalledWith({ habit_target_count: 2 });
    });

    it('commits on blur only when not live', () => {
        const onChange = jest.fn();
        render(
            <HabitSettings
                values={values}
                firstDayOfWeek={1}
                onChange={onChange}
            />
        );
        const input = screen.getByLabelText('Times');
        fireEvent.change(input, { target: { value: '2' } });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith({ habit_target_count: 2 });
    });
});

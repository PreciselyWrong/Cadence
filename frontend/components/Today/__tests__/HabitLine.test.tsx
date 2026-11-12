import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { DayHabitsSection } from '../HabitLine';
import type { CadenceHabit } from '../../../utils/cadenceHabitsService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
    }),
}));

const habit = (uid: string, name: string): CadenceHabit =>
    ({
        uid,
        name,
        color_argb: null,
        goal: { goal_type: 'BINARY', direction: 'AT_LEAST', target_minor: 1 },
        status: { evaluation: null, streak: null, date: '2026-11-12' },
    }) as unknown as CadenceHabit;

const renderSection = (hideCompleted = false) => {
    const onLog = jest.fn().mockResolvedValue(undefined);
    render(
        <MemoryRouter>
            <DayHabitsSection
                open={[habit('a', 'Stretch')]}
                done={[habit('b', 'Read')]}
                hideCompleted={hideCompleted}
                minuteOf={(uid) => (uid === 'a' ? 450 : null)}
                amountOf={() => 1}
                onLog={onLog}
            />
        </MemoryRouter>
    );
    return onLog;
};

describe('DayHabitsSection', () => {
    it('checks a yes/no habit in one tap', () => {
        const onLog = renderSection();
        fireEvent.click(
            screen.getByRole('button', { name: 'Mark Stretch as done' })
        );
        expect(onLog).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'a' }),
            1
        );
        expect(screen.getByText('07:30')).toBeInTheDocument();
    });

    it('keeps the done habits collapsed', () => {
        renderSection();
        expect(screen.queryByText('Read')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done · 1' }));
        expect(screen.getByText('Read')).toBeInTheDocument();
    });

    it('hides the done habits with « Hide completed »', () => {
        renderSection(true);
        expect(
            screen.queryByRole('button', { name: /Done/ })
        ).not.toBeInTheDocument();
    });
});

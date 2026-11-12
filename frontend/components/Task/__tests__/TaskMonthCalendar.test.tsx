import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskMonthCalendar from '../TaskMonthCalendar';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        i18n: { language: 'fr' },
    }),
}));

jest.mock('../../Calendar/CalendarMonthView', () => ({
    __esModule: true,
    default: () => null,
}));

describe('TaskMonthCalendar', () => {
    it("names the month in the reader's language", () => {
        render(
            <TaskMonthCalendar
                tasks={[]}
                onOpenTask={jest.fn()}
                onMoveDue={jest.fn()}
            />
        );

        const month = new Intl.DateTimeFormat('fr', {
            month: 'long',
            year: 'numeric',
        }).format(new Date());
        expect(screen.getByText(month)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Previous month' })
        ).toBeInTheDocument();
    });
});

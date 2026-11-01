import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import GoalRow from '../GoalRow';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

describe('GoalRow', () => {
    // A phone has no hover: a menu that only appears on hover is invisible
    // there, and an unnamed icon button says nothing to a screen reader.
    it('names its menu button and keeps it visible without hover', () => {
        render(
            <MemoryRouter>
                <GoalRow
                    goal={{ uid: 'g1', title: 'Run a marathon' } as any}
                    onDelete={jest.fn()}
                />
            </MemoryRouter>
        );
        const menu = screen.getByRole('button', { name: 'More actions' });
        expect(menu.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
        expect(menu.className).toMatch(/focus-visible:opacity-100/);
    });

    it('keeps its counts on one line', () => {
        render(
            <MemoryRouter>
                <GoalRow
                    goal={
                        {
                            uid: 'g1',
                            title: 'Run a marathon',
                            key_results_count: 4,
                        } as any
                    }
                />
            </MemoryRouter>
        );
        expect(
            screen.getByText(/Key results/).parentElement?.className
        ).toMatch(/whitespace-nowrap/);
    });
});

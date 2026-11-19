import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShortcutsHelp from '../ShortcutsHelp';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

describe('ShortcutsHelp', () => {
    // The Plan board's keys were only in a screen reader hint before.
    it('lists the Plan page keys in their own group', () => {
        render(<ShortcutsHelp onClose={jest.fn()} />);
        const plan = screen
            .getByRole('heading', { name: 'On the Plan page' })
            .closest('section') as HTMLElement;
        expect(within(plan).getByText('Add to the inbox')).toBeInTheDocument();
        expect(
            within(plan).getByText('Move the task (or the selection) a day')
        ).toBeInTheDocument();
        expect(
            within(plan).getByText(
                'Pick several tasks (Ctrl, Cmd or Shift click)'
            )
        ).toBeInTheDocument();
    });
});

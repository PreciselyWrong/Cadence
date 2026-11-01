import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecurringScopeDialogHost } from '../RecurringScopeDialog';
import { askRecurringScope } from '../../../utils/recurringScope';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const openPrompt = (kind: 'edit' | 'delete' = 'edit') => {
    let answer: Promise<unknown> | undefined;
    act(() => {
        answer = askRecurringScope(kind);
    });
    return answer as Promise<unknown>;
};

describe('RecurringScopeDialogHost', () => {
    it('renders nothing until an edit or a deletion is waiting', () => {
        render(<RecurringScopeDialogHost />);
        expect(
            screen.queryByTestId('recurring-scope-dialog')
        ).not.toBeInTheDocument();
    });

    it.each([
        ['recurring-scope-this', 'this'],
        ['recurring-scope-following', 'following'],
        ['recurring-scope-all', 'all'],
    ])('%s resolves the %s scope', async (testId, scope) => {
        render(<RecurringScopeDialogHost />);
        const answer = openPrompt();

        fireEvent.click(screen.getByTestId(testId));

        await expect(answer).resolves.toBe(scope);
        expect(
            screen.queryByTestId('recurring-scope-dialog')
        ).not.toBeInTheDocument();
    });

    it('asks about an edit or a deletion by its title', () => {
        render(<RecurringScopeDialogHost />);
        openPrompt('edit');
        expect(
            screen.getByText('Edit this task or the series?')
        ).toBeInTheDocument();

        openPrompt('delete');
        expect(
            screen.getByText('Delete this task or the series?')
        ).toBeInTheDocument();
    });

    it('cancels with the cancel button', async () => {
        render(<RecurringScopeDialogHost />);
        const answer = openPrompt();

        fireEvent.click(screen.getByTestId('recurring-scope-cancel'));

        await expect(answer).resolves.toBeNull();
    });

    it('cancels on Escape', async () => {
        render(<RecurringScopeDialogHost />);
        const answer = openPrompt();

        fireEvent.keyDown(document, { key: 'Escape' });

        await expect(answer).resolves.toBeNull();
    });

    it('cancels on a click on the overlay but not inside the dialog', async () => {
        render(<RecurringScopeDialogHost />);
        const answer = openPrompt();

        fireEvent.click(screen.getByRole('dialog'));
        expect(
            screen.getByTestId('recurring-scope-dialog')
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('recurring-scope-dialog'));
        await expect(answer).resolves.toBeNull();
    });
});

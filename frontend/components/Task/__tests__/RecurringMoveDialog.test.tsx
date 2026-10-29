import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecurringMoveDialogHost } from '../RecurringMoveDialog';
import { askRecurringMoveScope } from '../../../utils/recurringMove';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const openPrompt = () => {
    let answer: Promise<unknown> | undefined;
    act(() => {
        answer = askRecurringMoveScope();
    });
    return answer as Promise<unknown>;
};

describe('RecurringMoveDialogHost', () => {
    it('renders nothing until a move is requested', () => {
        render(<RecurringMoveDialogHost />);
        expect(
            screen.queryByTestId('recurring-move-dialog')
        ).not.toBeInTheDocument();
    });

    it.each([
        ['recurring-move-this', 'this'],
        ['recurring-move-following', 'following'],
        ['recurring-move-all', 'all'],
    ])('%s resolves the %s scope', async (testId, scope) => {
        render(<RecurringMoveDialogHost />);
        const answer = openPrompt();

        fireEvent.click(screen.getByTestId(testId));

        await expect(answer).resolves.toBe(scope);
        expect(
            screen.queryByTestId('recurring-move-dialog')
        ).not.toBeInTheDocument();
    });

    it('cancels with the cancel button', async () => {
        render(<RecurringMoveDialogHost />);
        const answer = openPrompt();

        fireEvent.click(screen.getByTestId('recurring-move-cancel'));

        await expect(answer).resolves.toBeNull();
    });

    it('cancels on Escape', async () => {
        render(<RecurringMoveDialogHost />);
        const answer = openPrompt();

        fireEvent.keyDown(document, { key: 'Escape' });

        await expect(answer).resolves.toBeNull();
    });

    it('cancels on a click on the overlay but not inside the dialog', async () => {
        render(<RecurringMoveDialogHost />);
        const answer = openPrompt();

        fireEvent.click(screen.getByRole('dialog'));
        expect(screen.getByTestId('recurring-move-dialog')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('recurring-move-dialog'));
        await expect(answer).resolves.toBeNull();
    });
});

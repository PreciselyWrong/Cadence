import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskContexts from '../TaskContexts';
import {
    deleteContext,
    fetchContexts,
    updateContext,
} from '../../../utils/triageService';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: unknown) =>
        typeof fallback === 'string' ? fallback : key;
    return { useTranslation: () => ({ t, i18n: { language: 'fr' } }) };
});
jest.mock('../../../utils/triageService', () => ({
    fetchContexts: jest.fn(),
    updateContext: jest.fn(),
    deleteContext: jest.fn(),
}));

const CONTEXT = {
    uid: 'ctx-1',
    scope: 'task' as const,
    target_ref: 't1',
    text: 'Pas avant jeudi',
};

describe('TaskContexts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders nothing when the task has no context', async () => {
        (fetchContexts as jest.Mock).mockResolvedValue([]);
        const { container } = render(<TaskContexts taskUid="t1" />);
        await waitFor(() => expect(fetchContexts).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('lists the contexts of the task and deletes one', async () => {
        (fetchContexts as jest.Mock).mockResolvedValue([CONTEXT]);
        (deleteContext as jest.Mock).mockResolvedValue(undefined);
        render(<TaskContexts taskUid="t1" />);
        expect(await screen.findByText('Pas avant jeudi')).toBeInTheDocument();
        expect(fetchContexts).toHaveBeenCalledWith({
            scope: 'task',
            target_ref: 't1',
        });
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await waitFor(() =>
            expect(deleteContext).toHaveBeenCalledWith('ctx-1')
        );
    });

    it('edits a context text', async () => {
        (fetchContexts as jest.Mock).mockResolvedValue([CONTEXT]);
        (updateContext as jest.Mock).mockResolvedValue({
            ...CONTEXT,
            text: 'Pas avant vendredi',
        });
        render(<TaskContexts taskUid="t1" />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Modifier le contexte' })
        );
        const input = screen.getByLabelText('Modifier le contexte');
        fireEvent.change(input, { target: { value: 'Pas avant vendredi' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() =>
            expect(updateContext).toHaveBeenCalledWith(
                'ctx-1',
                'Pas avant vendredi'
            )
        );
    });
});

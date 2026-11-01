import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToastProvider, useToast } from '../ToastContext';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) =>
            ({ 'common.undo': 'Annuler', 'common.close': 'Fermer' })[key] ??
            fallback ??
            key,
    }),
}));

const Trigger: React.FC<{ onUndo: () => void }> = ({ onUndo }) => {
    const { showUndoToast } = useToast();
    return (
        <button type="button" onClick={() => showUndoToast('Done', onUndo)}>
            go
        </button>
    );
};

describe('ToastProvider', () => {
    it('announces toasts and labels Undo and close in the user language', () => {
        const onUndo = jest.fn();
        render(
            <ToastProvider>
                <Trigger onUndo={onUndo} />
            </ToastProvider>
        );
        act(() => {
            fireEvent.click(screen.getByText('go'));
        });
        expect(screen.getByRole('status')).toHaveTextContent('Done');
        expect(
            screen.getByRole('button', { name: 'Fermer' })
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
    });
});

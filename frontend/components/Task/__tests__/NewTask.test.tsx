import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { addDays, format } from 'date-fns';
import NewTask from '../NewTask';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
        i18n: { language: 'fr' },
    }),
}));

const mockShowErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: mockShowErrorToast }),
}));

describe('NewTask', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses the given placeholder', () => {
        render(<NewTask onTaskCreate={jest.fn()} placeholder="+ Add task" />);
        expect(screen.getByPlaceholderText('+ Add task')).toBeInTheDocument();
    });

    it('creates the trimmed name on Enter and clears the field', async () => {
        const onTaskCreate = jest.fn().mockResolvedValue(undefined);
        render(
            <NewTask onTaskCreate={onTaskCreate} placeholder="+ Add task" />
        );
        const input = screen.getByTestId('new-task-input') as HTMLInputElement;

        fireEvent.change(input, { target: { value: '  Buy milk  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(onTaskCreate).toHaveBeenCalledWith('Buy milk', {})
        );
        expect(input.value).toBe('');
    });

    it('reads the date and priority of the typed line on Enter', async () => {
        const onTaskCreate = jest.fn().mockResolvedValue(undefined);
        const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
        render(<NewTask onTaskCreate={onTaskCreate} />);
        const input = screen.getByTestId('new-task-input');

        fireEvent.change(input, {
            target: { value: 'Appeler Lucas demain !1' },
        });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(onTaskCreate).toHaveBeenCalledWith(
                'Appeler Lucas',
                expect.objectContaining({
                    priority: 'high',
                    due_date: tomorrow,
                })
            )
        );
    });

    it('sends no extras for plain text', async () => {
        const onTaskCreate = jest.fn().mockResolvedValue(undefined);
        render(<NewTask onTaskCreate={onTaskCreate} />);
        const input = screen.getByTestId('new-task-input');

        fireEvent.change(input, { target: { value: 'Buy milk' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(onTaskCreate).toHaveBeenCalledWith('Buy milk', {})
        );
    });

    it('does not create anything for a blank name', () => {
        const onTaskCreate = jest.fn();
        render(<NewTask onTaskCreate={onTaskCreate} />);
        const input = screen.getByTestId('new-task-input');

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onTaskCreate).not.toHaveBeenCalled();
    });

    it('clears the field on Escape without creating a task', () => {
        const onTaskCreate = jest.fn();
        render(<NewTask onTaskCreate={onTaskCreate} />);
        const input = screen.getByTestId('new-task-input') as HTMLInputElement;

        fireEvent.change(input, { target: { value: 'Draft' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(input.value).toBe('');
        expect(onTaskCreate).not.toHaveBeenCalled();
    });

    it('restores the text and shows an error when creation fails', async () => {
        const onTaskCreate = jest.fn().mockRejectedValue(new Error('boom'));
        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        render(<NewTask onTaskCreate={onTaskCreate} />);
        const input = screen.getByTestId('new-task-input') as HTMLInputElement;

        fireEvent.change(input, { target: { value: 'Keep me' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(mockShowErrorToast).toHaveBeenCalled());
        expect(input.value).toBe('Keep me');
        errorSpy.mockRestore();
    });
});

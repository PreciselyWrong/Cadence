import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FocusBlocksDialog from '../FocusBlocksDialog';
import { saveFocus } from '../../../utils/dailyPlanService';

jest.mock('../../../utils/dailyPlanService', () => ({
    saveFocus: jest.fn(),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));

const blocks = [
    { id: 'work', days: [1, 2, 3], start: 450, end: 1080, label: 'Work' },
    { id: 'gym', days: [3], start: 1140, end: 1200 },
];

const renderDialog = (exceptions = []) => {
    const onSaved = jest.fn();
    render(
        <FocusBlocksDialog
            blocks={blocks}
            exceptions={exceptions}
            today="2026-11-02"
            language="en"
            onSaved={onSaved}
            onClose={jest.fn()}
        />
    );
    return onSaved;
};

describe('FocusBlocksDialog exceptions', () => {
    beforeEach(() => {
        (saveFocus as jest.Mock).mockReset();
        (saveFocus as jest.Mock).mockImplementation(async (focus) => focus);
    });

    it('adds an exception that frees every block from today', async () => {
        const onSaved = renderDialog();

        fireEvent.click(screen.getByTestId('focus-exception-add'));
        fireEvent.change(screen.getByLabelText('Last day'), {
            target: { value: '2026-11-06' },
        });
        fireEvent.change(screen.getByLabelText('Reason (optional)'), {
            target: { value: 'Holidays' },
        });
        fireEvent.click(screen.getByTestId('focus-save'));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(saveFocus).toHaveBeenCalledWith({
            blocks,
            exceptions: [
                {
                    id: '',
                    start: '2026-11-02',
                    end: '2026-11-06',
                    block_ids: null,
                    label: 'Holidays',
                },
            ],
        });
    });

    it('frees only the chosen blocks', async () => {
        renderDialog([
            {
                id: 'x',
                start: '2026-11-04',
                end: '2026-11-04',
                block_ids: null,
            },
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Work' }));
        fireEvent.click(screen.getByTestId('focus-save'));

        await waitFor(() => expect(saveFocus).toHaveBeenCalled());
        expect(
            (saveFocus as jest.Mock).mock.calls[0][0].exceptions[0].block_ids
        ).toEqual(['work']);
    });

    it('drops an exception whose only block is deleted instead of freeing all', async () => {
        renderDialog([
            {
                id: 'x',
                start: '2026-11-04',
                end: '2026-11-04',
                block_ids: ['gym'],
            },
            {
                id: 'y',
                start: '2026-11-05',
                end: '2026-11-05',
                block_ids: null,
            },
        ]);

        fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
        fireEvent.click(screen.getByTestId('focus-save'));

        await waitFor(() => expect(saveFocus).toHaveBeenCalled());
        expect((saveFocus as jest.Mock).mock.calls[0][0].exceptions).toEqual([
            {
                id: 'y',
                start: '2026-11-05',
                end: '2026-11-05',
                block_ids: null,
            },
        ]);
    });

    it('cannot save an exception that ends before it starts', () => {
        renderDialog();
        fireEvent.click(screen.getByTestId('focus-exception-add'));
        fireEvent.change(screen.getByLabelText('Last day'), {
            target: { value: '2026-11-01' },
        });
        expect(screen.getByTestId('focus-save')).toBeDisabled();
    });
});

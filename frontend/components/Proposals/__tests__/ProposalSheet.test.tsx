import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ProposalSheet, { groupChanges } from '../ProposalSheet';
import {
    applyProposal,
    dismissProposal,
    getProposal,
    replyProposal,
    ProposalDetail,
    WeekChange,
} from '../../../utils/proposalsService';

jest.mock('../../../utils/proposalsService', () => ({
    applyProposal: jest.fn(),
    dismissProposal: jest.fn(),
    getProposal: jest.fn(),
    replyProposal: jest.fn(),
}));

const mockToasts = {
    showErrorToast: jest.fn(),
    showSuccessToast: jest.fn(),
    showUndoToast: jest.fn(),
};
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => mockToasts,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const UID = 'prop-1';

const detail = (overrides: Partial<ProposalDetail> = {}): ProposalDetail => ({
    uid: UID,
    kind: 'week',
    status: 'ready',
    period_start: '2026-11-16',
    period_end: '2026-11-22',
    answer: {
        summary: 'Mardi est libre ; un retard replacé.',
        questions: [
            {
                id: 'q1',
                text: 'Tu travailles mardi ?',
                choices: ['Oui', 'Non'],
            },
        ],
        changes: [
            {
                task_uid: 't1',
                op: 'plan_day',
                date: '2026-11-17',
                reason: 'Mardi est libre',
            },
            {
                task_uid: 't2',
                op: 'plan_day',
                date: '2026-11-17',
                reason: 'Court',
            },
            { task_uid: 't3', op: 'drop', reason: 'Plus d’actualité' },
        ],
    },
    error: null,
    reply_text: null,
    created_at: '2026-11-13T08:00:00Z',
    updated_at: '2026-11-13T08:00:00Z',
    facts: {
        period: { start: '2026-11-16', end: '2026-11-22' },
        today: '2026-11-16',
        days: [],
        tasks: [
            { uid: 't1', name: 'Valider le devis' },
            { uid: 't2', name: 'Appeler le plombier' },
            { uid: 't3', name: 'Ancienne idée' },
        ],
    },
    ...overrides,
});

const renderSheet = (onClose = jest.fn()) => {
    render(<ProposalSheet uid={UID} onClose={onClose} />);
    return onClose;
};

describe('ProposalSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getProposal as jest.Mock).mockResolvedValue(detail());
    });

    it('groups the changes by day, then by the week, parked and dropped', () => {
        const changes: WeekChange[] = [
            { task_uid: 'a', op: 'drop', reason: '' },
            { task_uid: 'b', op: 'plan_day', date: '2026-11-18', reason: '' },
            { task_uid: 'c', op: 'due', date: '2026-11-17', reason: '' },
            { task_uid: 'd', op: 'this_week', reason: '' },
            { task_uid: 'e', op: 'later', reason: '' },
            { task_uid: 'f', op: 'plan_day', date: '2026-11-18', reason: '' },
        ];
        const groups = groupChanges(changes).map((group) => group.key.id);
        expect(groups).toEqual([
            'day:2026-11-17',
            'day:2026-11-18',
            'this_week',
            'later',
            'drop',
        ]);
        expect(
            groupChanges(changes)[1].rows.map((row) => row.task_uid)
        ).toEqual(['b', 'f']);
    });

    it('lists the changes by day with the task names from the facts', async () => {
        renderSheet();
        expect(await screen.findByText('Valider le devis')).toBeInTheDocument();
        expect(screen.getByText('Ancienne idée')).toBeInTheDocument();
        // One group per day, one for the drops.
        expect(screen.getAllByRole('region')).toHaveLength(2);
        expect(
            screen.getByText('Mardi est libre ; un retard replacé.')
        ).toBeInTheDocument();
    });

    it('applies only the checked changes', async () => {
        (applyProposal as jest.Mock).mockResolvedValue({
            uid: UID,
            status: 'applied',
            results: [
                { task_uid: 't1', state: 'applied' },
                { task_uid: 't3', state: 'applied' },
            ],
        });
        renderSheet();
        await screen.findByText('Valider le devis');

        fireEvent.click(screen.getByLabelText(/Appeler le plombier/));
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer (2)' }));

        await waitFor(() =>
            expect(applyProposal).toHaveBeenCalledWith(UID, {
                task_uids: ['t1', 't3'],
            })
        );
    });

    it('sends a question answer as a reply and waits again', async () => {
        (replyProposal as jest.Mock).mockResolvedValue(
            detail({ status: 'pending' })
        );
        renderSheet();
        await screen.findByText('Tu travailles mardi ?');

        fireEvent.click(screen.getByRole('button', { name: 'Oui' }));

        await waitFor(() =>
            expect(replyProposal).toHaveBeenCalledWith(
                UID,
                'Q: Tu travailles mardi ? R: Oui'
            )
        );
        expect(
            await screen.findByText('Ta semaine se prépare…')
        ).toBeInTheDocument();
    });

    it('does not apply when nothing is checked', async () => {
        renderSheet();
        await screen.findByText('Valider le devis');
        fireEvent.click(screen.getByLabelText(/Valider le devis/));
        fireEvent.click(screen.getByLabelText(/Appeler le plombier/));
        fireEvent.click(screen.getByLabelText(/Ancienne idée/));
        const apply = screen.getByRole('button', { name: 'Appliquer (0)' });
        expect(apply).toBeDisabled();
        expect(applyProposal).not.toHaveBeenCalled();
    });

    it('closes on Escape and dismisses only from the quiet link', async () => {
        (dismissProposal as jest.Mock).mockResolvedValue({
            uid: UID,
            status: 'dismissed',
        });
        const onClose = renderSheet();
        await screen.findByText('Valider le devis');

        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await waitFor(() => expect(dismissProposal).toHaveBeenCalledWith(UID));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('shows the preparing state while the proposal is pending', async () => {
        (getProposal as jest.Mock).mockResolvedValue(
            detail({ status: 'pending', answer: null })
        );
        renderSheet();
        expect(
            await screen.findByText('Ta semaine se prépare…')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Appliquer (0)' })
        ).not.toBeInTheDocument();
    });

    it('closes the sheet with Escape', async () => {
        const onClose = renderSheet();
        await screen.findByText('Valider le devis');
        act(() => {
            fireEvent.keyDown(window, { key: 'Escape' });
        });
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
});

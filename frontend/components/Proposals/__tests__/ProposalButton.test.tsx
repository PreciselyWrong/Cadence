import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ProposalButton from '../ProposalButton';
import {
    createProposal,
    listProposals,
    ProposalSummary,
} from '../../../utils/proposalsService';

jest.mock('../../../utils/proposalsService', () => ({
    createProposal: jest.fn(),
    listProposals: jest.fn(),
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
        t: (_key: string, fallback: string) => fallback,
    }),
}));

const summary = (
    status: ProposalSummary['status'],
    kind: ProposalSummary['kind'] = 'week'
): ProposalSummary => ({
    uid: 'p1',
    kind,
    status,
    period_start: null,
    period_end: null,
    answer: null,
    error: null,
    reply_text: null,
    created_at: '2026-11-13T08:00:00Z',
    updated_at: '2026-11-13T08:00:00Z',
});

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="search">{location.search}</output>;
};

const renderButton = (kind: 'week' | 'review' = 'week') =>
    render(
        <MemoryRouter initialEntries={['/today']}>
            <ProposalButton kind={kind} />
            <LocationProbe />
        </MemoryRouter>
    );

describe('ProposalButton', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('asks for the week and shows the preparing state', async () => {
        (listProposals as jest.Mock).mockResolvedValue([]);
        (createProposal as jest.Mock).mockResolvedValue({
            uid: 'p1',
            status: 'pending',
        });
        renderButton();

        fireEvent.click(
            await screen.findByRole('button', { name: 'Planifier ma semaine' })
        );

        await waitFor(() =>
            expect(createProposal).toHaveBeenCalledWith('week')
        );
        const preparing = await screen.findByRole('button', {
            name: /En préparation/,
        });
        expect(preparing).toBeDisabled();
    });

    it('turns into the ready state, then opens the sheet by its uid', async () => {
        (listProposals as jest.Mock).mockResolvedValueOnce([
            summary('pending'),
        ]);
        renderButton();
        await screen.findByRole('button', { name: /En préparation/ });

        (listProposals as jest.Mock).mockResolvedValue([summary('ready')]);
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });

        fireEvent.click(
            await screen.findByRole('button', { name: 'Ta semaine est prête' })
        );
        expect(screen.getByTestId('search')).toHaveTextContent('proposal=p1');
    });

    it('stops polling once the proposal is no longer pending', async () => {
        (listProposals as jest.Mock).mockResolvedValue([summary('ready')]);
        renderButton();
        await screen.findByRole('button', { name: 'Ta semaine est prête' });
        (listProposals as jest.Mock).mockClear();

        await act(async () => {
            jest.advanceTimersByTime(20000);
        });

        expect(listProposals).not.toHaveBeenCalled();
    });

    it('announces a failed week with a retry', async () => {
        (listProposals as jest.Mock).mockResolvedValueOnce([
            summary('pending'),
        ]);
        renderButton();
        await screen.findByRole('button', { name: /En préparation/ });

        (listProposals as jest.Mock).mockResolvedValue([
            { ...summary('failed'), error: 'timeout' },
        ]);
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });

        await waitFor(() =>
            expect(mockToasts.showUndoToast).toHaveBeenCalledWith(
                'La préparation a échoué.',
                expect.any(Function),
                'Réessayer'
            )
        );
    });
});

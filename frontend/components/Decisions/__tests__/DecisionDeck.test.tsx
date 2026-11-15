import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import DecisionDeck from '../DecisionDeck';
import {
    decideDecision,
    DecisionCard,
    fetchDecisions,
} from '../../../utils/decisionsService';

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

const mockToasts = {
    showErrorToast: jest.fn(),
    showSuccessToast: jest.fn(),
};
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => mockToasts,
}));

jest.mock('../../../utils/decisionsService', () => ({
    fetchDecisions: jest.fn(),
    decideDecision: jest.fn(() => Promise.resolve({ ok: true })),
}));

const fetchMock = fetchDecisions as jest.Mock;
const decideMock = decideDecision as jest.Mock;

const makeCard = (
    uid: string,
    overrides: Partial<DecisionCard> = {}
): DecisionCard => ({
    uid,
    kind: 'subscription',
    kind_label: 'Abonnements',
    key: `key-${uid}`,
    title: `Abonnement ${uid}`,
    context: 'Renouvellement dans 5 jours',
    body: 'Ligne 1\nLigne 2',
    url: 'https://example.com/sub',
    choices: [
        { id: 'keep', label: 'Garder' },
        { id: 'cancel', label: 'Résilier', tone: 'danger' },
    ],
    recommended: 'keep',
    reason: 'Peu utilisé ces 3 derniers mois',
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    ...overrides,
});

describe('DecisionDeck', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        decideMock.mockReset();
        decideMock.mockResolvedValue({ ok: true });
        fetchMock.mockReset();
        mockToasts.showErrorToast.mockReset();
        window.matchMedia = jest.fn().mockReturnValue({
            matches: true,
            addListener: jest.fn(),
            removeListener: jest.fn(),
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('fetches decisions on mount, shows card details, recommended and danger buttons', async () => {
        jest.useRealTimers();
        const longBody = Array.from({ length: 9 }, (_, i) => `L${i + 1}`).join(
            '\n'
        );
        fetchMock.mockResolvedValue({
            items: [makeCard('d1', { body: longBody })],
            count: 1,
        });
        render(<DecisionDeck onClose={jest.fn()} />);

        expect(
            await screen.findByRole('heading', { name: 'Abonnement d1' })
        ).toBeInTheDocument();
        expect(screen.getByText('Abonnements')).toBeInTheDocument();
        expect(
            screen.getByText('Renouvellement dans 5 jours')
        ).toBeInTheDocument();
        expect(
            screen.getByText('Peu utilisé ces 3 derniers mois')
        ).toBeInTheDocument();
        expect(screen.getByTestId('decision-deck-progress')).toHaveTextContent(
            '1 / 1'
        );

        const openLink = screen.getByRole('link', { name: /Ouvrir/ });
        expect(openLink).toHaveAttribute('href', 'https://example.com/sub');

        const body = screen.getByTestId('decision-deck-body');
        expect(body).toHaveClass('line-clamp-[7]');
        fireEvent.click(screen.getByRole('button', { name: 'Lire la suite' }));
        expect(body).not.toHaveClass('line-clamp-[7]');

        const keepBtn = screen.getByRole('button', { name: /Garder/ });
        const cancelBtn = screen.getByRole('button', { name: /Résilier/ });
        expect(keepBtn).toHaveAttribute('data-recommended', 'true');
        expect(cancelBtn).toHaveAttribute('data-tone', 'danger');
    });

    it('ignores non-https URLs', () => {
        render(
            <DecisionDeck
                items={[makeCard('d1', { url: 'javascript:alert(1)' })]}
                onClose={jest.fn()}
            />
        );
        expect(screen.queryByRole('link', { name: /Ouvrir/ })).toBeNull();
    });

    it('supports choice click, undo, and keyboard shortcuts (1-5, Enter, arrows, Ctrl+Z, Escape)', async () => {
        const onClose = jest.fn();
        render(
            <DecisionDeck
                items={[
                    makeCard('d1', { created_at: '2026-11-01T10:00:00Z' }),
                    makeCard('d2', { created_at: '2026-11-02T10:00:00Z' }),
                    makeCard('d3', { created_at: '2026-11-03T10:00:00Z' }),
                ]}
                onClose={onClose}
            />
        );

        // Press 2 -> chooses 'cancel' on d1, held for undo
        fireEvent.keyDown(window, { key: '2' });
        expect(
            screen.getByRole('heading', { name: 'Abonnement d2' })
        ).toBeInTheDocument();
        expect(decideMock).not.toHaveBeenCalled();

        // Ctrl+Z -> undoes d1
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        expect(
            screen.getByRole('heading', { name: 'Abonnement d1' })
        ).toBeInTheDocument();

        // Enter -> chooses recommended ('keep') on d1
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(
            screen.getByRole('heading', { name: 'Abonnement d2' })
        ).toBeInTheDocument();

        // ArrowDown -> skips d2 to the end
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        expect(
            screen.getByRole('heading', { name: 'Abonnement d3' })
        ).toBeInTheDocument();
        // d1 flushed when ArrowLeft decides 'later' on d3
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(decideMock).toHaveBeenCalledWith(
            'd1',
            'keep',
            {},
            expect.any(String)
        );
        expect(
            screen.getByRole('heading', { name: 'Abonnement d2' })
        ).toBeInTheDocument();

        // Finish d2 with ArrowRight
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(screen.getByTestId('decision-deck-done')).toHaveTextContent(
            'Tout est décidé'
        );

        // Escape closes and flushes held d2
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(decideMock).toHaveBeenCalledWith(
            'd2',
            'keep',
            {},
            expect.any(String)
        );
    });

    it('sends a note and shows status', () => {
        render(<DecisionDeck items={[makeCard('d1')]} onClose={jest.fn()} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Répondre par un mot' })
        );
        const input = screen.getByPlaceholderText('Un mot pour l’agent');
        fireEvent.change(input, { target: { value: 'Attendre décembre' } });
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

        expect(screen.getByRole('status')).toHaveTextContent(
            'Renvoyé à l’agent'
        );
        act(() => {
            jest.advanceTimersByTime(5000);
        });
        expect(decideMock).toHaveBeenCalledWith(
            'd1',
            'note',
            { note: 'Attendre décembre' },
            expect.any(String)
        );
    });

    it('handles 409 without bringing the card back', async () => {
        const err = Object.assign(new Error('Conflict'), { status: 409 });
        decideMock.mockRejectedValueOnce(err);
        render(<DecisionDeck items={[makeCard('d1')]} onClose={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Garder/ }));
        act(() => {
            jest.advanceTimersByTime(5000);
        });
        await waitFor(() =>
            expect(mockToasts.showErrorToast).toHaveBeenCalledWith(
                'Déjà traité ailleurs.'
            )
        );
        expect(screen.getByTestId('decision-deck-done')).toBeInTheDocument();
    });
});

import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import CareerPage from '../CareerPage';
import {
    applyCareerDecisions,
    listCareerProposals,
} from '../../../utils/proposalsService';

jest.mock('../../../utils/proposalsService', () => ({
    listCareerProposals: jest.fn(),
    applyCareerDecisions: jest.fn(),
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
        i18n: { language: 'fr' },
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

const listMock = listCareerProposals as jest.Mock;
const applyMock = applyCareerDecisions as jest.Mock;

const daysFromNow = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const PROPOSAL = {
    uid: 'c1',
    kind: 'career',
    status: 'ready',
    created_at: '2026-11-13T09:15:00',
    answer: {
        headline: 'Deux relances et une offre à trancher',
        subtitle: 'Le marché bouge cette semaine.',
        stats: [
            { label: 'Candidatures', value: 12 },
            { label: 'Entretiens', value: 2 },
            { label: 'Offres', value: 1 },
        ],
        followups: [
            {
                id: 'f1',
                title: 'Développeur React',
                company: 'Acme',
                applied_at: daysFromNow(-21),
                draft_url: 'https://mail.example.com/draft/1',
            },
        ],
        offers: [
            {
                id: 'o1',
                title: 'Lead frontend',
                company: 'Globex',
                location: 'Lausanne',
                rate: '120k',
                url: 'https://jobs.example.com/o1',
                expires: daysFromNow(5),
                fit: 'Correspond à ton expérience TypeScript.',
            },
        ],
        tasks: [{ id: 't1', name: 'Mettre à jour le CV' }],
    },
    decisions: [],
};

beforeEach(() => {
    jest.clearAllMocks();
    listMock.mockResolvedValue([PROPOSAL]);
    applyMock.mockResolvedValue({ uid: 'c1', status: 'ready', results: [] });
});

describe('CareerPage', () => {
    it('renders the sections of the latest career proposal', async () => {
        render(<CareerPage />);

        expect(
            await screen.findByText('Deux relances et une offre à trancher')
        ).toBeInTheDocument();
        expect(screen.getByText('Carrière')).toBeInTheDocument();
        expect(screen.getByText('mis à jour à 9 h 15')).toBeInTheDocument();
        expect(screen.getByText('Candidatures')).toBeInTheDocument();

        const followups = screen.getByTestId('career-followups');
        expect(within(followups).getByText('Relances')).toBeInTheDocument();
        expect(
            within(followups).getByText('postulé il y a 3 semaines')
        ).toBeInTheDocument();
        expect(
            within(followups).getByRole('link', {
                name: 'Ouvrir le brouillon',
            })
        ).toHaveAttribute('href', 'https://mail.example.com/draft/1');

        const offer = screen.getByTestId('career-offer-o1');
        expect(
            within(offer).getByText('Lausanne · 120k · expire dans 5 jours')
        ).toBeInTheDocument();
        expect(
            within(offer).getByText('Correspond à ton expérience TypeScript.')
        ).toBeInTheDocument();
        expect(within(offer).getByRole('link')).toHaveAttribute(
            'href',
            'https://jobs.example.com/o1'
        );

        expect(screen.getByText('Mettre à jour le CV')).toBeInTheDocument();
    });

    it('tapping Postuler calls nothing and only stages the choice', async () => {
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        fireEvent.click(
            within(offer).getByRole('button', { name: 'Postuler' })
        );

        expect(applyMock).not.toHaveBeenCalled();
        expect(
            within(offer).getByRole('button', { name: 'Postuler' })
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            within(offer).getByText('choisi : Postuler')
        ).toBeInTheDocument();
        expect(screen.getByTestId('career-offer-o1')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Valider (1)' })
        ).toBeEnabled();
    });

    it('another tap on a button changes the staged choice', async () => {
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        fireEvent.click(
            within(offer).getByRole('button', { name: 'Postuler' })
        );
        fireEvent.click(within(offer).getByRole('button', { name: 'Passer' }));

        expect(applyMock).not.toHaveBeenCalled();
        expect(within(offer).getByText('choisi : Passer')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Valider (1)' })
        ).toBeInTheDocument();
    });

    it('Valider sends every staged decision in one call, with notes', async () => {
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        fireEvent.click(
            within(offer).getByRole('button', { name: 'Remarque' })
        );
        fireEvent.change(within(offer).getByRole('textbox'), {
            target: { value: '  Seulement en télétravail  ' },
        });
        fireEvent.click(
            within(offer).getByRole('button', { name: 'Postuler' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Fait' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
        fireEvent.click(screen.getByRole('button', { name: 'Valider (3)' }));

        expect(applyMock).toHaveBeenCalledTimes(1);
        expect(applyMock).toHaveBeenCalledWith('c1', [
            {
                kind: 'offer',
                id: 'o1',
                op: 'apply',
                note: 'Seulement en télétravail',
            },
            { kind: 'followup', id: 'f1', op: 'done' },
            { kind: 'task', id: 't1', op: 'create' },
        ]);
        await waitFor(() =>
            expect(mockToasts.showSuccessToast).toHaveBeenCalledWith(
                '3 décisions appliquées'
            )
        );
        fireEvent.click(
            await screen.findByRole('button', { name: /Décidé \(3\)/ })
        );
        const decided = screen.getByTestId('career-decided');
        expect(
            within(decided).getByText('Lead frontend · Globex')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Valider/ })
        ).not.toBeInTheDocument();
    });

    it('Effacer drops the staged choices without calling the server', async () => {
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        fireEvent.click(
            within(offer).getByRole('button', { name: 'Postuler' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));

        expect(applyMock).not.toHaveBeenCalled();
        expect(
            within(offer).queryByText('choisi : Postuler')
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Valider/ })
        ).not.toBeInTheDocument();
    });

    it('Ctrl+Entrée validates the staged choices', async () => {
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        fireEvent.click(within(offer).getByRole('button', { name: 'Passer' }));
        expect(applyMock).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

        expect(applyMock).toHaveBeenCalledWith('c1', [
            { kind: 'offer', id: 'o1', op: 'skip' },
        ]);
    });

    it('asks to confirm leaving only while choices are staged', async () => {
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        const idle = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(idle);
        expect(idle.defaultPrevented).toBe(false);

        fireEvent.click(
            within(offer).getByRole('button', { name: 'Postuler' })
        );
        const staged = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(staged);
        expect(staged.defaultPrevented).toBe(true);
    });

    it('keeps the staged choices and shows the error when Valider fails', async () => {
        applyMock.mockRejectedValueOnce(new Error('boom'));
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        fireEvent.click(
            within(offer).getByRole('button', { name: 'Postuler' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Valider (1)' }));

        await waitFor(() =>
            expect(mockToasts.showErrorToast).toHaveBeenCalledWith(
                'La décision n’a pas été enregistrée.'
            )
        );
        expect(applyMock).toHaveBeenCalledTimes(1);
        expect(
            within(offer).getByText('choisi : Postuler')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Valider (1)' })
        ).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'La décision n’a pas été enregistrée.'
        );
    });

    it('keeps the decisions the server already applied in Décidé', async () => {
        listMock.mockResolvedValue([
            {
                ...PROPOSAL,
                decisions: [{ kind: 'followup', id: 'f1', op: 'done' }],
            },
        ]);
        render(<CareerPage />);

        expect(
            await screen.findByRole('button', { name: /Décidé \(1\)/ })
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId('career-followups')
        ).not.toBeInTheDocument();
    });

    it('opens only http and https addresses from the agent', async () => {
        listMock.mockResolvedValue([
            {
                ...PROPOSAL,
                answer: {
                    ...PROPOSAL.answer,
                    offers: [
                        {
                            ...PROPOSAL.answer.offers[0],
                            url: 'javascript:alert(1)',
                        },
                    ],
                },
            },
        ]);
        render(<CareerPage />);
        const offer = await screen.findByTestId('career-offer-o1');

        expect(within(offer).queryByRole('link')).not.toBeInTheDocument();
        expect(within(offer).getByText('Lead frontend')).toBeInTheDocument();
    });

    it('shows the empty state without a ready proposal', async () => {
        listMock.mockResolvedValue([]);
        render(<CareerPage />);

        expect(
            await screen.findByText('Rien de neuf aujourd’hui')
        ).toBeInTheDocument();
    });
});

describe('decisionMap', () => {
    it('keeps an item put off for later open on the next visit', () => {
        const { decisionMap } = jest.requireActual('../careerModel');
        const map = decisionMap([
            { kind: 'offer', id: 'a', op: 'later' },
            { kind: 'offer', id: 'b', op: 'skip' },
        ]);
        expect(map.has('offer:a')).toBe(false);
        expect(map.has('offer:b')).toBe(true);
    });
});

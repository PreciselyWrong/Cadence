import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import WeekendSheet from '../WeekendSheet';
import {
    applyWeekendDecisions,
    getWeekendProposal,
} from '../../../utils/proposalsService';

jest.mock('../../../utils/proposalsService', () => ({
    getWeekendProposal: jest.fn(),
    applyWeekendDecisions: jest.fn(),
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

const getMock = getWeekendProposal as jest.Mock;
const applyMock = applyWeekendDecisions as jest.Mock;

const PROPOSAL = {
    uid: 'w1',
    kind: 'weekend',
    status: 'ready',
    created_at: '2026-11-13T17:00:00',
    answer: {
        headline: 'Un week-end doux',
        subtitle: 'Soleil samedi, pluie dimanche.',
        days: [
            { date: '2026-11-14', weather: 'sun', min: 4, max: 11 },
            { date: '2026-11-15', weather: 'rain', min: 3, max: 7 },
        ],
        slots: [
            {
                id: 's1',
                date: '2026-11-14',
                part: 'morning',
                weather: 'sun',
                temp: 8,
                activity: {
                    title: 'Marché de Morges',
                    url: 'https://example.com/marche',
                    note: 'produits locaux',
                    travel: '20 min',
                },
                recommended: true,
            },
            {
                id: 's2',
                date: '2026-11-14',
                part: 'afternoon',
                weather: 'sun',
                temp: 10,
                activity: { title: 'Balade à Dizy' },
            },
            {
                id: 's3',
                date: '2026-11-15',
                part: 'morning',
                busy: 'Foire aux livres, Penthalaz',
            },
        ],
        elsewhere: [
            {
                place: 'Pontarlier',
                date: '2026-11-14',
                weather: 'sun',
                temp: 10,
                travel: '1 h',
            },
        ],
    },
};

describe('WeekendSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getMock.mockResolvedValue(PROPOSAL);
        applyMock.mockResolvedValue({
            uid: 'w1',
            status: 'ready',
            results: [],
        });
    });

    it('renders the days, each slot and the places with better weather', async () => {
        render(<WeekendSheet uid="w1" onClose={jest.fn()} />);

        expect(await screen.findByText('Un week-end doux')).toBeInTheDocument();
        expect(screen.getByText('Samedi matin')).toBeInTheDocument();
        expect(screen.getByText('Samedi après-midi')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Marché de Morges' })
        ).toHaveAttribute('href', 'https://example.com/marche');
        expect(screen.getByText('Plus beau ailleurs')).toBeInTheDocument();
        expect(
            screen.getByText('Pontarlier, samedi : ensoleillé, 10° · 1 h')
        ).toBeInTheDocument();
        expect(getMock).toHaveBeenCalledWith('w1');
    });

    it('shows a busy slot without any decision chip', async () => {
        render(<WeekendSheet uid="w1" onClose={jest.fn()} />);
        const busy = await screen.findByTestId('weekend-slot-s3');

        expect(
            within(busy).getByText('Occupé : Foire aux livres, Penthalaz')
        ).toBeInTheDocument();
        expect(within(busy).queryByRole('button')).not.toBeInTheDocument();
    });

    it('preselects the recommended outing and sends the picks with « Valider »', async () => {
        const onClose = jest.fn();
        render(<WeekendSheet uid="w1" onClose={onClose} />);
        const first = await screen.findByTestId('weekend-slot-s1');

        const calendar = within(first).getByRole('button', {
            name: 'Mettre à l’agenda',
        });
        expect(calendar).toHaveAttribute('aria-pressed', 'true');

        const second = screen.getByTestId('weekend-slot-s2');
        fireEvent.click(
            within(second).getByRole('button', { name: 'Ignorer' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        await waitFor(() =>
            expect(applyMock).toHaveBeenCalledWith('w1', [
                { slot_id: 's1', op: 'calendar' },
                { slot_id: 's2', op: 'skip' },
            ])
        );
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('sends nothing when every pick is cleared', async () => {
        render(<WeekendSheet uid="w1" onClose={jest.fn()} />);
        const first = await screen.findByTestId('weekend-slot-s1');
        fireEvent.click(
            within(first).getByRole('button', { name: 'Mettre à l’agenda' })
        );

        expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
        expect(applyMock).not.toHaveBeenCalled();
    });
});

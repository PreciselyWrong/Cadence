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
    listWeekendProposals,
    requestWeekend,
} from '../../../utils/proposalsService';
import { drawWeekendImage, shareImage } from '../shareImage';
import { defaultDays } from '../weekendModel';

jest.mock('../../../utils/proposalsService', () => ({
    getWeekendProposal: jest.fn(),
    applyWeekendDecisions: jest.fn(),
    listWeekendProposals: jest.fn(),
    requestWeekend: jest.fn(),
}));
jest.mock('../shareImage', () => ({
    drawWeekendImage: jest.fn(),
    shareImage: jest.fn(),
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
const listMock = listWeekendProposals as jest.Mock;
const requestMock = requestWeekend as jest.Mock;
const drawMock = drawWeekendImage as jest.Mock;
const shareMock = shareImage as jest.Mock;

const localToday = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

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
                    image: 'https://example.com/marche.jpg',
                    place: 'Morges, Place du Marché',
                    start: '09:00',
                    note: 'produits locaux',
                    travel: '20 min',
                    after: 'Ensuite : café au bord du lac',
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
        nearby: [
            {
                title: 'Atelier céramique',
                date: '2026-11-14',
                start: '14:00',
                place: 'La Sarraz',
                travel: '5 min',
                url: 'https://example.com/atelier',
                image: 'https://example.com/atelier.jpg',
            },
            {
                title: 'Marché artisanal',
                date: '2026-11-15',
                place: 'Cossonay',
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
        expect(
            screen.getByText('Morges, Place du Marché · 09:00 · 20 min')
        ).toBeInTheDocument();
        expect(screen.getByText('produits locaux')).toBeInTheDocument();
        expect(
            screen.getByText('Ensuite : café au bord du lac')
        ).toBeInTheDocument();
        expect(screen.getByText('Près de chez nous')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Atelier céramique' })
        ).toHaveAttribute('href', 'https://example.com/atelier');
        expect(
            screen.getByText('samedi 14:00 · La Sarraz · 5 min')
        ).toBeInTheDocument();
        expect(screen.getByText('dimanche · Cossonay')).toBeInTheDocument();
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

    describe('on demand', () => {
        const PENDING = {
            uid: 'r1',
            kind: 'weekend',
            status: 'pending',
            created_at: '2026-11-22T10:00:00',
            answer: null,
            request: { dates: ['2026-11-25', '2026-11-28'] },
        };

        it('opens the latest weekend with the request being prepared above it', async () => {
            listMock.mockResolvedValue([PENDING, PROPOSAL]);
            render(<WeekendSheet onClose={jest.fn()} />);

            expect(
                await screen.findByText('Un week-end doux')
            ).toBeInTheDocument();
            expect(screen.getByTestId('weekend-request')).toHaveTextContent(
                /En préparation pour mer\.? 25, sam\.? 28/
            );
            expect(getMock).not.toHaveBeenCalled();
            expect(screen.queryByTestId('weekend-picker')).toBeNull();
        });

        it('shows the day picker when there is no weekend yet and asks for the picked days', async () => {
            listMock.mockResolvedValueOnce([]).mockResolvedValue([PENDING]);
            requestMock.mockResolvedValue({ uid: 'r1', status: 'pending' });
            render(<WeekendSheet onClose={jest.fn()} />);

            const picker = await screen.findByTestId('weekend-picker');
            const pressed = within(picker)
                .getAllByRole('button', { pressed: true })
                .map((b) => b.textContent);
            expect(pressed).toHaveLength(defaultDays(localToday()).length);

            fireEvent.click(
                within(picker).getByRole('button', { name: 'Préparer' })
            );

            await waitFor(() =>
                expect(requestMock).toHaveBeenCalledWith(
                    defaultDays(localToday())
                )
            );
            expect(
                await screen.findByTestId('weekend-request')
            ).toHaveTextContent('En préparation pour');
        });

        it('allows four days at most', async () => {
            listMock.mockResolvedValue([]);
            render(<WeekendSheet onClose={jest.fn()} />);
            const picker = await screen.findByTestId('weekend-picker');
            const free = () =>
                within(picker)
                    .getAllByRole('button', { pressed: false })
                    .filter((b) => !(b as HTMLButtonElement).disabled);
            while (
                within(picker).getAllByRole('button', { pressed: true })
                    .length < 4
            ) {
                fireEvent.click(free()[0]);
            }
            expect(free()).toHaveLength(0);
        });

        it('shares the image of the weekend with the picks not sent yet', async () => {
            const blob = new Blob(['png']);
            drawMock.mockResolvedValue(blob);
            shareMock.mockResolvedValue('shared');
            render(<WeekendSheet uid="w1" onClose={jest.fn()} />);
            await screen.findByText('Un week-end doux');

            fireEvent.click(screen.getByRole('button', { name: 'Partager' }));

            await waitFor(() =>
                expect(shareMock).toHaveBeenCalledWith(
                    blob,
                    'week-end-2026-11-14.png',
                    'Un week-end doux'
                )
            );
            const picks = drawMock.mock.calls[0][1] as Map<string, string>;
            expect([...picks]).toEqual([['s1', 'calendar']]);
        });
    });
});

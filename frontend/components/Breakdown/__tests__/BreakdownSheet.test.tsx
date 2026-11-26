import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import BreakdownSheet from '../BreakdownSheet';
import {
    applyBreakdown,
    proposeBreakdown,
} from '../../../utils/breakdownService';

jest.mock('../../../utils/breakdownService', () => ({
    proposeBreakdown: jest.fn(),
    applyBreakdown: jest.fn(),
}));
const mockToasts = { showErrorToast: jest.fn(), showSuccessToast: jest.fn() };
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

const proposeMock = proposeBreakdown as jest.Mock;
const applyMock = applyBreakdown as jest.Mock;

const renderSheet = (overrides: Partial<{ onApplied: jest.Mock }> = {}) => {
    const onClose = jest.fn();
    const onApplied = overrides.onApplied ?? jest.fn();
    render(
        <MemoryRouter>
            <BreakdownSheet
                taskUid="t1"
                taskName="Déclarer les impôts"
                onClose={onClose}
                onApplied={onApplied}
            />
        </MemoryRouter>
    );
    return { onClose, onApplied };
};

const AI = {
    source: 'ai',
    reason: null,
    steps: [
        { name: 'Ouvrir le dossier', minutes: 10 },
        { name: 'Lister les pièces', minutes: 25 },
    ],
    total_minutes: 35,
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('BreakdownSheet with an AI proposal', () => {
    it('shows a loading state, then the editable steps and their total', async () => {
        let resolve!: (value: unknown) => void;
        proposeMock.mockReturnValue(new Promise((r) => (resolve = r)));
        renderSheet();
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Ajouter les étapes' })
        ).toBeDisabled();

        resolve(AI);
        expect(
            await screen.findByDisplayValue('Ouvrir le dossier')
        ).toBeInTheDocument();
        expect(screen.getByTestId('breakdown-total')).toHaveTextContent(
            'Total : 35m'
        );
        expect(screen.queryByText(/Première étape/)).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Ajouter 2 étapes' })
        ).toBeEnabled();
    });

    it('applies the edited, reordered steps and tells the caller', async () => {
        proposeMock.mockResolvedValue(AI);
        applyMock.mockResolvedValue({ subtasks: [] });
        const { onApplied, onClose } = renderSheet();
        await screen.findByDisplayValue('Ouvrir le dossier');

        fireEvent.change(screen.getByLabelText('Nom de l’étape 1'), {
            target: { value: 'Rassembler les papiers' },
        });
        fireEvent.change(screen.getByLabelText('Minutes de l’étape 2'), {
            target: { value: '' },
        });
        fireEvent.click(screen.getByLabelText('Descendre l’étape 1'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Ajouter 2 étapes' })
        );

        await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
        expect(applyMock).toHaveBeenCalledWith('t1', [
            { name: 'Lister les pièces', minutes: null },
            { name: 'Rassembler les papiers', minutes: 10 },
        ]);
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(onApplied).toHaveBeenCalled();
    });

    it('removes a step and refuses invalid minutes', async () => {
        proposeMock.mockResolvedValue(AI);
        renderSheet();
        await screen.findByDisplayValue('Ouvrir le dossier');

        fireEvent.change(screen.getByLabelText('Minutes de l’étape 1'), {
            target: { value: '3' },
        });
        expect(screen.getByRole('alert')).toHaveTextContent('5 à 720 minutes');
        expect(
            screen.getByRole('button', { name: 'Ajouter 2 étapes' })
        ).toBeDisabled();

        fireEvent.click(screen.getByLabelText('Retirer l’étape 1'));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Ajouter 1 étapes' })
        ).toBeEnabled();
    });

    it('keeps the sheet open and says so when adding fails', async () => {
        proposeMock.mockResolvedValue(AI);
        applyMock.mockRejectedValue(new Error('boom'));
        const { onClose } = renderSheet();
        await screen.findByDisplayValue('Ouvrir le dossier');
        fireEvent.click(
            screen.getByRole('button', { name: 'Ajouter 2 étapes' })
        );
        await waitFor(() =>
            expect(mockToasts.showErrorToast).toHaveBeenCalled()
        );
        expect(onClose).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: 'Ajouter 2 étapes' })
        ).toBeEnabled();
    });
});

describe('BreakdownSheet without the AI', () => {
    it('asks for a first step of 2 minutes and sends what is typed', async () => {
        proposeMock.mockResolvedValue({
            source: 'fallback',
            reason: 'not_configured',
            steps: [],
            total_minutes: 0,
        });
        applyMock.mockResolvedValue({ subtasks: [] });
        renderSheet();

        expect(
            await screen.findByText('Première étape de 2 min ?')
        ).toBeInTheDocument();
        expect(screen.getByTestId('breakdown-reason')).toHaveTextContent(
            'IA non configurée.'
        );
        expect(
            screen.getByRole('link', { name: 'Profil › Assistant IA' })
        ).toHaveAttribute('href', '/profile?section=ai-assistant');

        const name = screen.getByLabelText('Nom de l’étape 1');
        expect(screen.getByLabelText('Minutes de l’étape 1')).toHaveValue('5');
        expect(
            screen.getByRole('button', { name: 'Ajouter les étapes' })
        ).toBeDisabled();

        fireEvent.change(name, { target: { value: 'Sortir le dossier' } });
        fireEvent.click(
            screen.getByRole('button', { name: 'Ajouter une étape' })
        );
        fireEvent.change(screen.getByLabelText('Nom de l’étape 2'), {
            target: { value: 'Appeler le comptable' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Ajouter 2 étapes' })
        );

        await waitFor(() =>
            expect(applyMock).toHaveBeenCalledWith('t1', [
                { name: 'Sortir le dossier', minutes: 5 },
                { name: 'Appeler le comptable', minutes: 5 },
            ])
        );
    });

    it.each([
        ['disabled', 'IA désactivée.'],
        ['failed', 'IA indisponible.'],
    ])(
        'names the reason %s without a settings link when it is not setup',
        async (reason, text) => {
            proposeMock.mockResolvedValue({
                source: 'fallback',
                reason,
                steps: [],
                total_minutes: 0,
            });
            renderSheet();
            expect(
                await screen.findByTestId('breakdown-reason')
            ).toHaveTextContent(text);
        }
    );

    it('falls back to a manual step when the request itself fails', async () => {
        proposeMock.mockRejectedValue(new Error('network'));
        renderSheet();
        expect(await screen.findByTestId('breakdown-reason')).toHaveTextContent(
            'IA indisponible.'
        );
        expect(screen.getByLabelText('Nom de l’étape 1')).toBeInTheDocument();
    });
});

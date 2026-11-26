import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BreakdownSettingsCard from '../BreakdownSettingsCard';
import {
    BreakdownSettings,
    getBreakdownSettings,
    updateBreakdownSettings,
} from '../../../../utils/breakdownService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
                String(options?.[name] ?? '')
            ),
    }),
}));
jest.mock('../../../Shared/ToastContext', () => {
    const toast = { showErrorToast: jest.fn(), showSuccessToast: jest.fn() };
    return { useToast: () => toast };
});
jest.mock('../../../../utils/breakdownService', () => ({
    ...jest.requireActual('../../../../utils/breakdownService'),
    getBreakdownSettings: jest.fn(),
    updateBreakdownSettings: jest.fn(),
}));

const DEFAULTS: BreakdownSettings = {
    enabled: true,
    model: '',
    max_steps: 8,
    min_step_minutes: 5,
    max_step_minutes: 60,
    note_chars: 2000,
    max_tokens: 1500,
};

describe('BreakdownSettingsCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getBreakdownSettings as jest.Mock).mockResolvedValue({
            settings: { ...DEFAULTS, max_steps: 6 },
            defaults: DEFAULTS,
            ai_configured: false,
        });
    });

    it('shows the values with the server defaults and a notice without AI', async () => {
        render(<BreakdownSettingsCard isActive />);
        const maxSteps = await screen.findByLabelText(/Étapes au plus/);
        expect(maxSteps).toHaveValue(6);
        expect(screen.getAllByText('Par défaut : 8').length).toBeGreaterThan(0);
        expect(screen.getByText(/Aucun fournisseur d’IA/)).toBeInTheDocument();
    });

    it('saves what was changed', async () => {
        (updateBreakdownSettings as jest.Mock).mockImplementation(
            async (patch) => ({
                settings: patch,
                defaults: DEFAULTS,
                ai_configured: true,
            })
        );
        render(<BreakdownSettingsCard isActive />);
        fireEvent.change(await screen.findByLabelText(/Étapes au plus/), {
            target: { value: '10' },
        });
        fireEvent.click(screen.getByLabelText('Activé'));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() =>
            expect(updateBreakdownSettings).toHaveBeenCalledWith({
                ...DEFAULTS,
                max_steps: 10,
                enabled: false,
            })
        );
    });
});

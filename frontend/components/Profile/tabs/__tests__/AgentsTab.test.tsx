import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentsTab from '../AgentsTab';
import {
    fetchAgentSettings,
    saveAgentSettings,
    testAgentConnection,
} from '../../../../utils/dailyBriefService';

jest.mock('react-i18next', () => {
    const t = (
        key: string,
        fallback?: unknown,
        options?: Record<string, unknown>
    ) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
            String(options?.[name] ?? '')
        );
    };
    return { useTranslation: () => ({ t, i18n: { language: 'fr' } }) };
});
jest.mock('../../../../utils/dailyBriefService', () => ({
    fetchAgentSettings: jest.fn(),
    saveAgentSettings: jest.fn(),
    testAgentConnection: jest.fn(),
}));

const SETTINGS = {
    baseUrl: 'http://agent.local',
    timeoutSeconds: 120,
    profiles: { mail: 'mail' },
    api_key_set: true,
    api_key_last4: '9xq2',
};

describe('AgentsTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchAgentSettings as jest.Mock).mockResolvedValue(SETTINGS);
        (saveAgentSettings as jest.Mock).mockImplementation(
            async () => SETTINGS
        );
    });

    it('shows only the last four characters of the key, never the key itself', async () => {
        render(<AgentsTab isActive />);
        expect(await screen.findByTestId('agents-key-state')).toHaveTextContent(
            '9xq2'
        );
        const input = screen.getByLabelText('Clé d’API') as HTMLInputElement;
        expect(input.value).toBe('');
    });

    it('keeps the stored key when none is typed', async () => {
        render(<AgentsTab isActive />);
        await screen.findByTestId('agents-key-state');
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(saveAgentSettings).toHaveBeenCalled());
        const patch = (saveAgentSettings as jest.Mock).mock.calls[0][0];
        expect(patch).not.toHaveProperty('api_key');
    });

    it('clears the stored key when Effacer is used', async () => {
        render(<AgentsTab isActive />);
        fireEvent.click(await screen.findByRole('button', { name: 'Effacer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() =>
            expect(saveAgentSettings).toHaveBeenCalledWith(
                expect.objectContaining({ api_key: null })
            )
        );
    });

    it('shows the connection results of the test', async () => {
        (testAgentConnection as jest.Mock).mockResolvedValue({
            health: 'ok',
            auth: 'unauthorized',
            profiles: { mail: 'missing' },
        });
        render(<AgentsTab isActive />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Tester la connexion' })
        );
        const result = await screen.findByTestId('agents-test-result');
        expect(result).toHaveTextContent('Clé refusée');
        expect(result).toHaveTextContent('Profil non défini');
    });

    it('offers no drafting profile and no triage rules: nothing used them', async () => {
        render(<AgentsTab isActive />);
        await screen.findByTestId('agents-key-state');
        expect(screen.queryByText('Profil rédaction')).toBeNull();
        expect(screen.queryByText('Règles de tri')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(saveAgentSettings).toHaveBeenCalled());
        const patch = (saveAgentSettings as jest.Mock).mock.calls[0][0];
        expect(patch.profiles).toEqual({ mail: 'mail' });
        expect(patch).not.toHaveProperty('triageRules');
    });

    it('shows a validation error from the API inline', async () => {
        (saveAgentSettings as jest.Mock).mockRejectedValue(
            new Error('baseUrl must use http or https')
        );
        render(<AgentsTab isActive />);
        await screen.findByTestId('agents-key-state');
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'baseUrl must use http or https'
        );
    });
});

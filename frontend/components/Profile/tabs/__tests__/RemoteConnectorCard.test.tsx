import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RemoteConnectorCard from '../RemoteConnectorCard';
import * as pairingService from '../../../../utils/mcpPairingService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, vars?: any) => {
            const text =
                typeof fallback === 'string'
                    ? fallback
                    : (fallback?.defaultValue ?? key);
            const values = typeof fallback === 'object' ? fallback : vars;
            return text.replace(
                /\{\{(\w+)\}\}/g,
                (_: string, name: string) => values?.[name] ?? ''
            );
        },
    }),
}));

jest.mock('../../../../utils/mcpPairingService', () => ({
    ...jest.requireActual('../../../../utils/mcpPairingService'),
    fetchPairing: jest.fn(),
    openPairing: jest.fn(),
}));

const mocked = pairingService as jest.Mocked<typeof pairingService>;
const URL = 'https://cadence.example.test/mcp';

describe('RemoteConnectorCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mocked.fetchPairing.mockResolvedValue({
            enabled: true,
            url: URL,
            open: false,
            expires_at: null,
        });
    });

    it('shows nothing when the remote connector is off', async () => {
        mocked.fetchPairing.mockResolvedValue({
            enabled: false,
            url: null,
            open: false,
            expires_at: null,
        });
        const { container } = render(<RemoteConnectorCard />);
        await waitFor(() => expect(mocked.fetchPairing).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('opens the pairing window and says until when', async () => {
        mocked.openPairing.mockResolvedValue({
            enabled: true,
            url: URL,
            open: true,
            expires_at: '2026-11-01T18:10:00.000Z',
        });
        render(<RemoteConnectorCard />);
        expect(await screen.findByText(new RegExp(URL))).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Authorize a new connector' })
        );

        expect(
            await screen.findByText(/Waiting for a connector until/)
        ).toBeInTheDocument();
        expect(mocked.openPairing).toHaveBeenCalledTimes(1);
    });

    it('explains when two-factor sign-in is needed first', async () => {
        const error = Object.assign(new Error('mfa_required'), {
            status: 403,
        });
        mocked.openPairing.mockRejectedValue(error);
        render(<RemoteConnectorCard />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Authorize a new connector',
            })
        );
        expect(
            await screen.findByText(/Turn on two-factor sign-in/)
        ).toBeInTheDocument();
    });
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { toString as qrToString } from 'qrcode';
import DeviceConnectQr, { buildConnectPayload } from '../DeviceConnectQr';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('qrcode', () => ({
    toString: jest.fn().mockResolvedValue('<svg data-testid="qr"></svg>'),
}));

describe('DeviceConnectQr', () => {
    it('encodes the server address and the key, nothing else', () => {
        const payload = JSON.parse(
            buildConnectPayload('https://tududi.tail.ts.net/app/', 'tt_abc')
        );

        expect(payload).toEqual({
            tududi: 1,
            server: 'https://tududi.tail.ts.net/app',
            token: 'tt_abc',
        });
    });

    it('renders the QR for a freshly generated key', async () => {
        render(<DeviceConnectQr token="tt_abc" />);

        await waitFor(() =>
            expect(screen.getByTestId('device-connect-qr').innerHTML).toContain(
                'svg'
            )
        );
        const [payload] = (qrToString as jest.Mock).mock.calls[0];
        expect(JSON.parse(payload).token).toBe('tt_abc');
    });
});

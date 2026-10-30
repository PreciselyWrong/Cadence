import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toString as qrToString } from 'qrcode';
import { getBasePath } from '../../../config/paths';

// What the Android and desktop apps read to connect: the server to sync
// with and the key to use. JSON rather than a URL, so the key never sits in
// an address that an intent or a log could keep.
export function buildConnectPayload(server: string, token: string): string {
    return JSON.stringify({
        tududi: 1,
        server: server.replace(/\/+$/, ''),
        token,
    });
}

const DeviceConnectQr: React.FC<{ token: string }> = ({ token }) => {
    const { t } = useTranslation();
    const [svg, setSvg] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const server = `${window.location.origin}${getBasePath()}`;
        qrToString(buildConnectPayload(server, token), {
            type: 'svg',
            margin: 1,
        })
            .then((markup) => {
                if (!cancelled) setSvg(markup);
            })
            .catch(() => {
                if (!cancelled) setSvg(null);
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    return (
        <div className="mt-4 flex flex-col sm:flex-row items-start gap-4">
            <div
                data-testid="device-connect-qr"
                className="w-48 h-48 shrink-0 bg-white p-2 rounded [&>svg]:w-full [&>svg]:h-full"
                aria-label={t(
                    'profile.apiKeys.connectQrLabel',
                    'QR code to connect a device'
                )}
                role="img"
                dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
            />
            <p className="text-sm text-green-900 dark:text-green-100 max-w-sm">
                {t(
                    'profile.apiKeys.connectQrHelp',
                    'Scan this code from the Cadence app on your phone or computer to connect it with this key.'
                )}
            </p>
        </div>
    );
};

export default DeviceConnectQr;

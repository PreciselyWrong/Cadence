import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    McpPairing,
    fetchPairing,
    openPairing,
} from '../../../utils/mcpPairingService';

// claude.ai can only register and connect in the ten minutes after this
// button is clicked (docs/38-remote-mcp.md). Hidden when the server has no
// public MCP URL.
const RemoteConnectorCard: React.FC = () => {
    const { t } = useTranslation();
    const [pairing, setPairing] = useState<McpPairing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        fetchPairing()
            .then(setPairing)
            .catch(() => setPairing(null));
    }, []);

    if (!pairing?.enabled) return null;

    const authorize = async () => {
        setBusy(true);
        setError(null);
        try {
            setPairing(await openPairing());
        } catch (failure) {
            const code = (failure as Error).message;
            setError(
                code === 'mfa_required'
                    ? t(
                          'profile.mcp.remote.mfaRequired',
                          'Turn on two-factor sign-in (Security) before connecting an assistant.'
                      )
                    : code === 'not_allowed'
                      ? t(
                            'profile.mcp.remote.notAllowed',
                            'Only an administrator can connect assistants to Cadence.'
                        )
                      : t(
                            'profile.mcp.remote.error',
                            'Could not open the pairing window.'
                        )
            );
        } finally {
            setBusy(false);
        }
    };

    const until =
        pairing.open && pairing.expires_at
            ? new Date(pairing.expires_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : null;

    return (
        <section className="border-l-4 border-indigo-500 pl-4">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                {t('profile.mcp.remote.title', 'Connect claude.ai')}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                {t(
                    'profile.mcp.remote.description',
                    'Add Cadence as a custom connector in claude.ai at {{url}}. Cadence only accepts a new connector in the 10 minutes after you click below.',
                    { url: pairing.url }
                )}
            </p>
            <button
                type="button"
                onClick={authorize}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
                {t('profile.mcp.remote.authorize', 'Authorize a new connector')}
            </button>
            {until && (
                <p
                    className="mt-3 text-sm text-gray-700 dark:text-gray-200"
                    role="status"
                >
                    {t(
                        'profile.mcp.remote.open',
                        'Waiting for a connector until {{time}}. Add or reconnect it in claude.ai now.',
                        { time: until }
                    )}
                </p>
            )}
            {error && (
                <p
                    className="mt-3 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                >
                    {error}
                </p>
            )}
        </section>
    );
};

export default RemoteConnectorCard;

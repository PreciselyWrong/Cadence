import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORM } from '../../../constants/formClasses';
import {
    AgentCheck,
    AgentSettings,
    AgentSettingsPatch,
    AgentTestResult,
    fetchAgentSettings,
    saveAgentSettings,
    testAgentConnection,
} from '../../../utils/dailyBriefService';

interface AgentsTabProps {
    isActive: boolean;
}

// The API key is never sent back: the page shows only its last four
// characters. Typing a new value replaces it; "Effacer" removes it.
const AgentsTab: React.FC<AgentsTabProps> = ({ isActive }) => {
    const { t } = useTranslation();
    const [saved, setSaved] = useState<AgentSettings | null>(null);
    const [baseUrl, setBaseUrl] = useState('');
    const [timeoutSeconds, setTimeoutSeconds] = useState(120);
    const [mailProfile, setMailProfile] = useState('');
    const [newKey, setNewKey] = useState('');
    const [clearKey, setClearKey] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<AgentTestResult | null>(null);
    const [busy, setBusy] = useState(false);

    const apply = (settings: AgentSettings) => {
        setSaved(settings);
        setBaseUrl(settings.baseUrl);
        setTimeoutSeconds(settings.timeoutSeconds);
        setMailProfile(settings.profiles.mail);
        setNewKey('');
        setClearKey(false);
    };

    useEffect(() => {
        if (!isActive || saved) return;
        fetchAgentSettings()
            .then(apply)
            .catch((err: Error) =>
                setError(
                    err?.message ||
                        t(
                            'agents.loadError',
                            'Impossible de charger les réglages de l’agent.'
                        )
                )
            );
    }, [isActive, saved, t]);

    const keyLabel = saved?.api_key_set
        ? t('agents.key.setLast4', 'Enregistrée (…{{last4}})', {
              last4: saved.api_key_last4 ?? '',
          })
        : t('agents.key.notSet', 'Aucune clé enregistrée');

    const save = async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        const patch: AgentSettingsPatch = {
            baseUrl,
            timeoutSeconds,
            profiles: { mail: mailProfile },
        };
        if (clearKey) patch.api_key = null;
        else if (newKey.trim() !== '') patch.api_key = newKey.trim();
        try {
            apply(await saveAgentSettings(patch));
            setNotice(t('agents.saved', 'Réglages enregistrés'));
        } catch (err) {
            setError(
                (err as Error).message ||
                    t(
                        'agents.saveError',
                        'Impossible d’enregistrer les réglages.'
                    )
            );
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setBusy(true);
        setError(null);
        try {
            setTestResult(await testAgentConnection());
        } catch (err) {
            setError(
                (err as Error).message ||
                    t('agents.testError', 'Le test a échoué.')
            );
        } finally {
            setBusy(false);
        }
    };

    const checkLabel = (
        value: AgentCheck | 'ok' | 'error' | 'unauthorized'
    ) => {
        switch (value) {
            case 'ok':
                return t('agents.check.ok', 'OK');
            case 'unauthorized':
                return t('agents.check.unauthorized', 'Clé refusée');
            case 'missing':
                return t('agents.check.missing', 'Profil non défini');
            default:
                return t('agents.check.error', 'Erreur');
        }
    };

    if (!saved) {
        return (
            <div className={isActive ? '' : 'hidden'}>
                {error ? (
                    <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                    >
                        {error}
                    </p>
                ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t('common.loading', 'Loading...')}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className={isActive ? '' : 'hidden'} data-testid="agents-tab">
            <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                {t('agents.title', 'Agents')}
            </h3>
            <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'agents.description',
                    'L’agent lit le courrier et rédige. Cadence ne garde aucun identifiant de messagerie.'
                )}
            </p>

            <section className="mb-6 space-y-3 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60">
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('agents.baseUrl', 'Adresse de l’agent')}
                    <input
                        type="url"
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                        className={FORM.input}
                    />
                </label>
                <div className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    <span>{t('agents.apiKey', 'Clé d’API')}</span>
                    <span
                        className="text-xs text-gray-600 dark:text-gray-300"
                        data-testid="agents-key-state"
                    >
                        {clearKey
                            ? t(
                                  'agents.key.willClear',
                                  'Sera effacée à l’enregistrement'
                              )
                            : keyLabel}
                    </span>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            autoComplete="off"
                            value={newKey}
                            placeholder={
                                saved.api_key_set
                                    ? t(
                                          'agents.key.replace',
                                          'Remplacer la clé'
                                      )
                                    : ''
                            }
                            onChange={(event) => {
                                setNewKey(event.target.value);
                                setClearKey(false);
                            }}
                            aria-label={t('agents.apiKey', 'Clé d’API')}
                            className={`${FORM.input} min-w-0 flex-1`}
                        />
                        {saved.api_key_set && (
                            <button
                                type="button"
                                onClick={() => {
                                    setClearKey(true);
                                    setNewKey('');
                                }}
                                className="h-10 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                                {t('agents.key.clear', 'Effacer')}
                            </button>
                        )}
                    </div>
                </div>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t('agents.timeout', 'Délai (secondes)')}
                    <input
                        type="number"
                        min={10}
                        max={600}
                        value={timeoutSeconds}
                        onChange={(event) =>
                            setTimeoutSeconds(Number(event.target.value))
                        }
                        className={`${FORM.input} w-28`}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('agents.profiles.mail', 'Profil courrier')}
                    <input
                        type="text"
                        value={mailProfile}
                        onChange={(event) => setMailProfile(event.target.value)}
                        className={FORM.input}
                    />
                </label>
            </section>

            {testResult && (
                <ul
                    data-testid="agents-test-result"
                    className="mb-4 space-y-1 text-sm text-gray-800 dark:text-gray-200"
                >
                    <li>
                        {t('agents.test.health', 'Agent joignable')} :{' '}
                        {checkLabel(testResult.health)}
                    </li>
                    <li>
                        {t('agents.test.auth', 'Authentification')} :{' '}
                        {checkLabel(testResult.auth)}
                    </li>
                    <li>
                        {t('agents.test.mail', 'Profil courrier')} :{' '}
                        {checkLabel(testResult.profiles.mail)}
                    </li>
                </ul>
            )}
            {error && (
                <p
                    role="alert"
                    className="mb-3 text-sm text-red-600 dark:text-red-400"
                >
                    {error}
                </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
                {notice && (
                    <span
                        role="status"
                        className="text-sm text-gray-600 dark:text-gray-300"
                    >
                        {notice}
                    </span>
                )}
                <button
                    type="button"
                    onClick={test}
                    disabled={busy}
                    className="h-10 rounded-full px-5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                    {t('agents.test.button', 'Tester la connexion')}
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-on hover:bg-primary/90 disabled:opacity-50"
                >
                    {t('agents.save', 'Enregistrer')}
                </button>
            </div>
        </div>
    );
};

export default AgentsTab;

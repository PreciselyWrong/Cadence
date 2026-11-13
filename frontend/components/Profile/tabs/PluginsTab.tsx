import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORM } from '../../../constants/formClasses';
import Button from '../../Shared/ui/Button';
import ConfirmDialog from '../../Shared/ConfirmDialog';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';
import {
    PluginInfo,
    PluginSettingField,
    PluginState,
    PluginsResponse,
    checkPluginUpdate,
    fetchPlugins,
    installPlugin,
    pullPlugin,
    reloadPlugin,
    reloadPlugins,
    removePlugin,
    updatePlugin,
} from '../../../utils/pluginsService';

interface PluginsTabProps {
    isActive: boolean;
}

type DraftValue = string | boolean;

const STATE_BADGE: Record<PluginState, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    disabled: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    missing: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    needs_approval:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    invalid: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    incompatible:
        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// Settings and the on/off switch do not apply to these states.
const NO_SETTINGS_STATES: PluginState[] = [
    'invalid',
    'incompatible',
    'missing',
];

const chipClass =
    'rounded-full bg-white px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-900/60 dark:text-gray-200';

const replaceIn = (plugins: PluginInfo[], next: PluginInfo) =>
    plugins.map((plugin) =>
        (plugin.id !== null && plugin.id === next.id) ||
        (plugin.folder !== null && plugin.folder === next.folder)
            ? next
            : plugin
    );

const upsertIn = (plugins: PluginInfo[], next: PluginInfo) =>
    plugins.some(
        (plugin) =>
            (plugin.id !== null && plugin.id === next.id) ||
            (plugin.folder !== null && plugin.folder === next.folder)
    )
        ? replaceIn(plugins, next)
        : [...plugins, next];

interface PluginCardProps {
    plugin: PluginInfo;
    onChange: (plugin: PluginInfo) => void;
    onRemoved: (id: string) => void;
}

const PluginCard: React.FC<PluginCardProps> = ({
    plugin,
    onChange,
    onRemoved,
}) => {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmingRemove, setConfirmingRemove] = useState(false);
    const [confirmingEnable, setConfirmingEnable] = useState(false);
    const [values, setValues] = useState<Record<string, DraftValue>>({});
    const [secrets, setSecrets] = useState<Record<string, string>>({});
    const [cleared, setCleared] = useState<Record<string, boolean>>({});

    // Drafts follow the saved values: they restart when the server returns
    // new settings, and survive an enable/disable that leaves them alone.
    const settingsKey = JSON.stringify(plugin.settings);
    useEffect(() => {
        const fields: PluginSettingField[] = JSON.parse(settingsKey);
        const next: Record<string, DraftValue> = {};
        for (const field of fields) {
            if (field.type === 'secret') continue;
            if (field.type === 'boolean')
                next[field.key] = field.value === true;
            else
                next[field.key] =
                    field.value === null || field.value === undefined
                        ? ''
                        : String(field.value);
        }
        setValues(next);
        setSecrets({});
        setCleared({});
    }, [settingsKey]);

    const id = plugin.id;
    const { state } = plugin;
    const failure = t('profile.plugins.saveError', 'Could not save the plugin');

    const run = async (
        action: () => Promise<PluginInfo>,
        done?: string
    ): Promise<void> => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            onChange(await action());
            if (done) setNotice(done);
        } catch (err) {
            setError((err as Error).message || failure);
        } finally {
            setBusy(false);
        }
    };

    const checked = state === 'active' || state === 'error';
    const canSwitch =
        id !== null &&
        ['disabled', 'active', 'error', 'needs_approval'].includes(state);
    const showSettings =
        id !== null &&
        plugin.settings.length > 0 &&
        !NO_SETTINGS_STATES.includes(state);

    const toggle = () => {
        if (id === null) return;
        if (!checked) {
            setConfirmingEnable(true);
            return;
        }
        void run(() => updatePlugin(id, { enabled: false }));
    };

    const approveAndEnable = () => {
        if (id === null) return;
        setConfirmingEnable(false);
        void run(() => updatePlugin(id, { enabled: true }));
    };

    const saveSettings = () => {
        if (id === null) return;
        const payload: Record<string, string | number | boolean | null> = {};
        for (const field of plugin.settings) {
            if (field.type === 'secret') {
                if (cleared[field.key]) payload[field.key] = null;
                else if (secrets[field.key])
                    payload[field.key] = secrets[field.key];
                continue;
            }
            const draft = values[field.key];
            if (field.type === 'boolean') payload[field.key] = draft === true;
            else if (field.type === 'number')
                payload[field.key] =
                    draft === undefined || draft === '' ? null : Number(draft);
            else payload[field.key] = typeof draft === 'string' ? draft : '';
        }
        void run(
            () => updatePlugin(id, { settings: payload }),
            t('profile.plugins.saved', 'Settings saved')
        );
    };

    const remove = async () => {
        if (id === null) return;
        setConfirmingRemove(false);
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await removePlugin(id);
            setBusy(false);
            onRemoved(id);
        } catch (err) {
            setError((err as Error).message || failure);
            setBusy(false);
        }
    };

    const versionLine = [
        plugin.version
            ? t('profile.plugins.version', 'Version {{version}}', {
                  version: plugin.version,
              })
            : null,
        plugin.loaded_version &&
        plugin.version &&
        plugin.loaded_version !== plugin.version
            ? t('profile.plugins.reloadPending', 'Reload to load {{version}}', {
                  version: plugin.version,
              })
            : null,
        plugin.previous_version
            ? t('profile.plugins.updatedFrom', 'updated from {{version}}', {
                  version: plugin.previous_version,
              })
            : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const stateLabel = (() => {
        switch (state) {
            case 'active':
                return t('profile.plugins.state.active', 'Running');
            case 'error':
                return t('profile.plugins.state.error', 'Error');
            case 'invalid':
                return t('profile.plugins.state.invalid', 'Invalid');
            case 'incompatible':
                return t('profile.plugins.state.incompatible', 'Incompatible');
            case 'needs_approval':
                return t(
                    'profile.plugins.state.needs_approval',
                    'Needs approval'
                );
            case 'missing':
                return t('profile.plugins.state.missing', 'Missing');
            default:
                return t('profile.plugins.state.disabled', 'Off');
        }
    })();

    const permissionLabel = (permission: string) => {
        if (permission === 'events')
            return t('profile.plugins.permission.events', 'Listens to events');
        if (permission === 'routes')
            return t(
                'profile.plugins.permission.routes',
                'Serves its own routes'
            );
        return permission;
    };

    const approvalMessage = [
        t(
            'profile.plugins.approveIntro',
            'This plugin runs inside the server and asks for:'
        ),
        ...plugin.permissions.map((p) => `• ${permissionLabel(p)}`),
        ...plugin.events.map((e) => `• ${e}`),
        t(
            'profile.plugins.approveOutro',
            'Permissions limit what Cadence hands the plugin; they are not a sandbox. Only approve code you have read.'
        ),
    ].join('\n');

    const { update } = plugin;

    const renderField = (field: PluginSettingField) => {
        const { key } = field;
        const requiredMark = field.required
            ? ` (${t('profile.plugins.required', 'required')})`
            : '';
        const help = field.help ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
                {field.help}
            </span>
        ) : null;

        if (field.type === 'boolean') {
            return (
                <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"
                >
                    <input
                        type="checkbox"
                        checked={values[key] === true}
                        onChange={(event) =>
                            setValues({
                                ...values,
                                [key]: event.target.checked,
                            })
                        }
                    />
                    <span>
                        {field.label}
                        {requiredMark}
                    </span>
                    {help}
                </label>
            );
        }

        if (field.type === 'secret') {
            return (
                <div
                    key={key}
                    className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200"
                >
                    <span>
                        {field.label}
                        {requiredMark}
                    </span>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            autoComplete="off"
                            aria-label={field.label}
                            value={secrets[key] ?? ''}
                            placeholder={
                                field.has_value
                                    ? t('profile.plugins.secretSaved', 'Saved')
                                    : ''
                            }
                            onChange={(event) => {
                                setSecrets({
                                    ...secrets,
                                    [key]: event.target.value,
                                });
                                setCleared({ ...cleared, [key]: false });
                            }}
                            className={`${FORM.input} min-w-0 flex-1`}
                        />
                        {field.has_value && (
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={cleared[key] === true}
                                onClick={() => {
                                    setSecrets({ ...secrets, [key]: '' });
                                    setCleared({ ...cleared, [key]: true });
                                }}
                            >
                                {t('profile.plugins.clearSecret', 'Clear')}
                            </Button>
                        )}
                    </div>
                    {help}
                </div>
            );
        }

        return (
            <label
                key={key}
                className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200"
            >
                <span>
                    {field.label}
                    {requiredMark}
                </span>
                {field.type === 'select' ? (
                    <select
                        value={
                            typeof values[key] === 'string' ? values[key] : ''
                        }
                        onChange={(event) =>
                            setValues({ ...values, [key]: event.target.value })
                        }
                        className={FORM.select}
                    >
                        {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={
                            typeof values[key] === 'string' ? values[key] : ''
                        }
                        onChange={(event) =>
                            setValues({ ...values, [key]: event.target.value })
                        }
                        className={FORM.input}
                    />
                )}
                {help}
            </label>
        );
    };

    return (
        <section
            data-testid={`plugin-${id ?? plugin.folder ?? 'unknown'}`}
            className="space-y-3 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60"
        >
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {plugin.name}
                    </h4>
                    {versionLine && (
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            {versionLine}
                        </p>
                    )}
                </div>
                <span
                    data-testid="plugin-state"
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_BADGE[state]}`}
                >
                    {stateLabel}
                </span>
            </header>

            {plugin.last_error && (
                <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400"
                >
                    {t('profile.plugins.errorLabel', 'Error')}:{' '}
                    {plugin.last_error}
                </p>
            )}

            {!NO_SETTINGS_STATES.includes(state) && (
                <>
                    {plugin.description && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            {plugin.description}
                        </p>
                    )}

                    {(plugin.permissions.length > 0 ||
                        plugin.events.length > 0) && (
                        <ul className="flex flex-wrap gap-1.5">
                            {plugin.permissions.map((permission) => (
                                <li
                                    key={`perm-${permission}`}
                                    className={chipClass}
                                >
                                    {permissionLabel(permission)}
                                </li>
                            ))}
                            {plugin.events.map((event) => (
                                <li
                                    key={`event-${event}`}
                                    className={chipClass}
                                >
                                    {event}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}

            {state === 'needs_approval' && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t(
                        'profile.plugins.needsApproval',
                        'This version asks for more than before. Turn it on again to approve its permissions and events.'
                    )}
                </p>
            )}

            {canSwitch && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                        {t('profile.plugins.enabled', 'Enabled')}
                    </span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        aria-label={t('profile.plugins.enabled', 'Enabled')}
                        disabled={busy}
                        onClick={toggle}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                            checked
                                ? 'bg-primary'
                                : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                checked ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                        />
                    </button>
                </div>
            )}

            {showSettings && (
                <div className="space-y-3">
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t('profile.plugins.settings', 'Settings')}
                    </h5>
                    {plugin.settings.map(renderField)}
                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={saveSettings}
                        >
                            {t('profile.plugins.saveSettings', 'Save settings')}
                        </Button>
                    </div>
                </div>
            )}

            {update && update.error && (
                <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400"
                >
                    {t(
                        'profile.plugins.updateError',
                        'Could not read the update address'
                    )}
                </p>
            )}
            {update && !update.error && update.latest && (
                <p className="text-sm text-gray-800 dark:text-gray-200">
                    {update.available
                        ? t(
                              'profile.plugins.updateAvailable',
                              'Update available: {{version}}',
                              { version: update.latest }
                          )
                        : t('profile.plugins.upToDate', 'Up to date')}
                </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
                {notice && (
                    <span
                        role="status"
                        className="mr-auto text-sm text-gray-600 dark:text-gray-300"
                    >
                        {notice}
                    </span>
                )}
                {error && (
                    <span
                        role="alert"
                        className="mr-auto text-sm text-red-600 dark:text-red-400"
                    >
                        {error}
                    </span>
                )}
                {update && id !== null && (
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => checkPluginUpdate(id))}
                    >
                        {t('profile.plugins.checkUpdate', 'Check for updates')}
                    </Button>
                )}
                {id !== null && plugin.installed_from_git && (
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                            void run(
                                () => pullPlugin(id),
                                t('profile.plugins.pulled', 'Plugin updated')
                            )
                        }
                    >
                        {t('profile.plugins.pull', 'Update')}
                    </Button>
                )}
                {id !== null && (
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => reloadPlugin(id))}
                    >
                        {t('profile.plugins.reload', 'Reload')}
                    </Button>
                )}
                {id !== null && (
                    <Button
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmingRemove(true)}
                    >
                        {t('profile.plugins.remove', 'Delete')}
                    </Button>
                )}
            </div>
            {confirmingEnable && (
                <ConfirmDialog
                    title={t(
                        'profile.plugins.approveTitle',
                        'Approve permissions?'
                    )}
                    message={approvalMessage}
                    confirmButtonText={t(
                        'profile.plugins.approve',
                        'Approve and enable'
                    )}
                    onConfirm={approveAndEnable}
                    onCancel={() => setConfirmingEnable(false)}
                />
            )}
            {confirmingRemove && (
                <ConfirmDialog
                    title={t(
                        'profile.plugins.removeTitle',
                        'Delete this plugin?'
                    )}
                    message={t(
                        'profile.plugins.removeMessage',
                        'Its folder and its settings are deleted from the server. This cannot be undone.'
                    )}
                    confirmButtonText={t('profile.plugins.remove', 'Delete')}
                    onConfirm={() => void remove()}
                    onCancel={() => setConfirmingRemove(false)}
                />
            )}
        </section>
    );
};

const PluginsTab: React.FC<PluginsTabProps> = ({ isActive }) => {
    const { t } = useTranslation();
    const [data, setData] = useState<PluginsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [installUrl, setInstallUrl] = useState('');
    const [installing, setInstalling] = useState(false);
    const [installError, setInstallError] = useState<string | null>(null);
    const [installNotice, setInstallNotice] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive || data) return;
        fetchPlugins()
            .then(setData)
            .catch((err: Error) =>
                setError(
                    err?.message ||
                        t('profile.plugins.loadError', 'Could not load plugins')
                )
            );
    }, [isActive, data, t]);

    const reloadAll = async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            setData(await reloadPlugins());
            setNotice(t('profile.plugins.reloaded', 'Plugins reloaded'));
        } catch (err) {
            setError(
                (err as Error).message ||
                    t('profile.plugins.loadError', 'Could not load plugins')
            );
        } finally {
            setBusy(false);
        }
    };

    const onPluginChange = (next: PluginInfo) => {
        setData((prev) =>
            prev ? { ...prev, plugins: upsertIn(prev.plugins, next) } : prev
        );
        void usePluginMenuStore.getState().load();
    };

    const onPluginRemoved = (removedId: string) => {
        setData((prev) =>
            prev
                ? {
                      ...prev,
                      plugins: prev.plugins.filter(
                          (plugin) => plugin.id !== removedId
                      ),
                  }
                : prev
        );
        void usePluginMenuStore.getState().load();
    };

    const submitInstall = async (event: React.FormEvent) => {
        event.preventDefault();
        const url = installUrl.trim();
        if (!url) return;
        setInstalling(true);
        setInstallError(null);
        setInstallNotice(null);
        try {
            const installed = await installPlugin(url);
            onPluginChange(installed);
            setInstallUrl('');
            setInstallNotice(
                t(
                    'profile.plugins.installed',
                    'Plugin added. Read what it asks for, then turn it on.'
                )
            );
        } catch (err) {
            setInstallError(
                (err as Error).message ||
                    t(
                        'profile.plugins.installError',
                        'Could not add the plugin'
                    )
            );
        } finally {
            setInstalling(false);
        }
    };

    if (!data) {
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

    if (!data.configured) {
        return (
            <div className={isActive ? '' : 'hidden'} data-testid="plugins-tab">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t(
                        'profile.plugins.notConfigured',
                        'Plugins are off. Set TUDUDI_PLUGINS_DIR to a folder that holds plugin folders, then restart the server.'
                    )}
                </p>
            </div>
        );
    }

    return (
        <div className={isActive ? '' : 'hidden'} data-testid="plugins-tab">
            <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.plugins.title', 'Plugins')}
            </h3>
            <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'profile.plugins.description',
                    'Plugins add your own integrations to the server. Only an admin sees them. A plugin stays off until you turn it on.'
                )}
            </p>

            <form
                onSubmit={submitInstall}
                data-testid="plugin-install"
                className="mb-5 space-y-2 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60"
            >
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    <span>
                        {t(
                            'profile.plugins.installLabel',
                            'Plugin Git address'
                        )}
                    </span>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            autoComplete="off"
                            value={installUrl}
                            placeholder="https://"
                            onChange={(event) =>
                                setInstallUrl(event.target.value)
                            }
                            className={`${FORM.input} min-w-0 flex-1`}
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={installing || installUrl.trim() === ''}
                        >
                            {installing
                                ? t('profile.plugins.installing', 'Adding...')
                                : t('profile.plugins.install', 'Add')}
                        </Button>
                    </div>
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                    {t(
                        'profile.plugins.installHint',
                        'This downloads code that runs in the server. Read what it asks for before you turn it on.'
                    )}
                </p>
                {installError && (
                    <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                    >
                        {installError}
                    </p>
                )}
                {installNotice && (
                    <p
                        role="status"
                        className="text-sm text-gray-600 dark:text-gray-300"
                    >
                        {installNotice}
                    </p>
                )}
            </form>

            <div className="mb-4 flex justify-end">
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={reloadAll}
                >
                    {t('profile.plugins.reloadAll', 'Reload all')}
                </Button>
            </div>

            {data.plugins.length === 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t(
                        'profile.plugins.none',
                        'No plugin found in the plugins folder.'
                    )}
                </p>
            )}

            <div className="space-y-4">
                {data.plugins.map((plugin) => (
                    <PluginCard
                        key={plugin.folder ?? plugin.id ?? plugin.name ?? ''}
                        plugin={plugin}
                        onChange={onPluginChange}
                        onRemoved={onPluginRemoved}
                    />
                ))}
            </div>

            {error && (
                <p
                    role="alert"
                    className="mt-4 text-sm text-red-600 dark:text-red-400"
                >
                    {error}
                </p>
            )}
            {notice && (
                <p
                    role="status"
                    className="mt-4 text-sm text-gray-600 dark:text-gray-300"
                >
                    {notice}
                </p>
            )}
        </div>
    );
};

export default PluginsTab;

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../Shared/ToastContext';
import ConfirmDialog from '../Shared/ConfirmDialog';
import {
    GoogleCalendar,
    GoogleCalendarSyncMode,
    GoogleStatus,
    GoogleSyncLogEntry,
    disconnectGoogle,
    fetchGoogleSyncLog,
    fetchGoogleStatus,
    startGoogleConnect,
    syncGoogleNow,
    updateGoogleCalendar,
    updateGoogleSettings,
} from '../../utils/googleSyncService';

interface GoogleSyncSectionProps {
    // Given by the Calendar page, which also draws the calendar chips;
    // the profile page leaves it out and the section loads its own.
    status?: GoogleStatus | null;
    onStatusChange?: (status: GoogleStatus) => void;
}

const buttonClass =
    'inline-flex min-h-[36px] items-center rounded-md px-3 text-sm font-medium disabled:opacity-50';

const Switch: React.FC<{
    checked: boolean;
    label: string;
    onChange: () => void;
}> = ({ checked, label, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            checked
                ? 'bg-blue-600 dark:bg-blue-500'
                : 'bg-gray-200 dark:bg-gray-600'
        }`}
    >
        <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                checked ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
        />
    </button>
);

// Two-way sync with Google Calendar and Google Tasks (fork). Like the rest
// of the calendars manager it sits inside the profile page's <form>, so it
// only uses type="button".
const GoogleSyncSection: React.FC<GoogleSyncSectionProps> = ({
    status: givenStatus,
    onStatusChange,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const [ownStatus, setOwnStatus] = useState<GoogleStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    const [logEntries, setLogEntries] = useState<GoogleSyncLogEntry[] | null>(
        null
    );
    const controlled = givenStatus !== undefined;
    const status = controlled ? givenStatus : ownStatus;

    const setStatus = (next: GoogleStatus) => {
        if (!controlled) setOwnStatus(next);
        onStatusChange?.(next);
    };

    useEffect(() => {
        if (controlled) return;
        fetchGoogleStatus()
            .then(setOwnStatus)
            .catch(() => setOwnStatus(null));
    }, [controlled]);

    const run = async (action: () => Promise<GoogleStatus | void>) => {
        if (busy) return;
        setBusy(true);
        try {
            const next = await action();
            setStatus(next || (await fetchGoogleStatus()));
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('profile.google.error', 'Google did not answer')
            );
        } finally {
            setBusy(false);
        }
    };

    const connect = async () => {
        setBusy(true);
        try {
            window.location.href = await startGoogleConnect();
        } catch (err) {
            setBusy(false);
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('profile.google.error', 'Google did not answer')
            );
        }
    };

    const toggleCalendar = async (calendar: GoogleCalendar) => {
        if (!status) return;
        const next = !calendar.show_on_calendar;
        const apply = (value: boolean) =>
            setStatus({
                ...status,
                calendars: status.calendars.map((c) =>
                    c.uid === calendar.uid
                        ? { ...c, show_on_calendar: value }
                        : c
                ),
            });
        apply(next);
        try {
            await updateGoogleCalendar(calendar.uid, {
                show_on_calendar: next,
            });
        } catch {
            apply(!next);
            showErrorToast(
                t(
                    'profile.calendars.toggleError',
                    'Could not update that calendar'
                )
            );
        }
    };

    const loadLog = () =>
        fetchGoogleSyncLog()
            .then(setLogEntries)
            .catch(() => setLogEntries([]));

    const toggleLog = () => {
        const next = !logOpen;
        setLogOpen(next);
        if (next) void loadLog();
    };

    // A sync ran: the open log follows.
    const lastSynced = status?.last_synced_at;
    useEffect(() => {
        if (logOpen) void loadLog();
    }, [lastSynced]);

    const kindLabel = (kind: GoogleSyncLogEntry['kind']) =>
        kind === 'conflict'
            ? t('profile.google.logConflict', 'Conflict')
            : kind === 'error'
              ? t('profile.google.logError', 'Error')
              : t('profile.google.logInfo', 'Info');

    const changeMode = async (
        calendar: GoogleCalendar,
        mode: GoogleCalendarSyncMode
    ) => {
        if (!status) return;
        try {
            const saved = await updateGoogleCalendar(calendar.uid, {
                sync_mode: mode,
            });
            setStatus({
                ...status,
                calendars: status.calendars.map((c) =>
                    c.uid === calendar.uid ? saved : c
                ),
            });
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t(
                          'profile.calendars.toggleError',
                          'Could not update that calendar'
                      )
            );
        }
    };

    if (!status) return null;

    return (
        <section
            className="mb-8 space-y-4 rounded-lg border border-gray-200 p-5 dark:border-gray-700"
            aria-labelledby="google-sync-title"
        >
            <div>
                <h3
                    id="google-sync-title"
                    className="text-base font-medium text-gray-900 dark:text-white"
                >
                    {t('profile.google.title', 'Google Calendar and Tasks')}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t(
                        'profile.google.description',
                        'Two-way sync: your Google calendars appear here and can be edited from Cadence, dated tasks go to a "Cadence" calendar in Google, and all your tasks sync with Google Tasks. Changes on either side follow within a few minutes.'
                    )}
                </p>
            </div>

            {!status.configured && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                    {t(
                        'profile.google.notConfigured',
                        'Not set up on this server: the administrator sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
                    )}
                </p>
            )}

            {status.configured && !status.connected && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void connect()}
                    className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-500`}
                >
                    {t('profile.google.connect', 'Connect Google')}
                </button>
            )}

            {status.connected && (
                <>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {status.email}
                        {status.last_error ? (
                            <span className="text-red-600 dark:text-red-400">
                                {` · ${status.last_error}`}
                            </span>
                        ) : status.last_synced_at ? (
                            ` · ${t(
                                'profile.google.lastSync',
                                'synced {{time}}',
                                {
                                    time: new Date(
                                        status.last_synced_at
                                    ).toLocaleString(),
                                }
                            )}`
                        ) : (
                            ` · ${t('profile.google.firstSync', 'first sync running…')}`
                        )}
                    </p>

                    <div className="space-y-3">
                        <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                            <span>
                                {t(
                                    'profile.google.syncEvents',
                                    'Calendars, and dated tasks in a "Cadence" calendar'
                                )}
                            </span>
                            <Switch
                                checked={Boolean(status.sync_events)}
                                label={t(
                                    'profile.google.syncEvents',
                                    'Calendars, and dated tasks in a "Cadence" calendar'
                                )}
                                onChange={() =>
                                    void run(() =>
                                        updateGoogleSettings({
                                            sync_events: !status.sync_events,
                                        })
                                    )
                                }
                            />
                        </label>
                        <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                            <span>
                                {t(
                                    'profile.google.syncTasks',
                                    'All tasks with Google Tasks (one list per project)'
                                )}
                            </span>
                            <Switch
                                checked={Boolean(status.sync_tasks)}
                                label={t(
                                    'profile.google.syncTasks',
                                    'All tasks with Google Tasks (one list per project)'
                                )}
                                onChange={() =>
                                    void run(() =>
                                        updateGoogleSettings({
                                            sync_tasks: !status.sync_tasks,
                                        })
                                    )
                                }
                            />
                        </label>
                    </div>

                    {status.sync_events && (
                        <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                            <span>
                                {t(
                                    'profile.google.taskCalendar',
                                    'Calendar for tasks with a time'
                                )}
                            </span>
                            <select
                                value={status.task_calendar_uid || ''}
                                disabled={busy}
                                onChange={(e) => {
                                    const value = e.target.value || null;
                                    void run(() =>
                                        updateGoogleSettings({
                                            task_calendar_uid: value,
                                        })
                                    );
                                }}
                                className="max-w-[50%] rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                            >
                                <option value="">
                                    {t(
                                        'profile.google.taskCalendarDefault',
                                        'Cadence (made by the sync)'
                                    )}
                                </option>
                                {status.calendars
                                    .filter((c) => !c.is_tududi && c.can_write)
                                    .map((c) => (
                                        <option key={c.uid} value={c.uid}>
                                            {c.name}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    )}

                    {status.calendars.some((c) => !c.is_tududi) && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t(
                                    'profile.google.calendars',
                                    'Shown on Calendar and Today'
                                )}
                            </h4>
                            {status.calendars
                                .filter((calendar) => !calendar.is_tududi)
                                .map((calendar) => (
                                    <div
                                        key={calendar.uid}
                                        className="flex items-center gap-3"
                                    >
                                        <span
                                            className="h-3 w-3 shrink-0 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    calendar.color || '#6b7280',
                                            }}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white">
                                            {calendar.name}
                                        </span>
                                        <select
                                            value={calendar.sync_mode || 'read'}
                                            aria-label={t(
                                                'profile.google.syncMode',
                                                'Sync mode for {{name}}',
                                                { name: calendar.name }
                                            )}
                                            onChange={(e) =>
                                                void changeMode(
                                                    calendar,
                                                    e.target
                                                        .value as GoogleCalendarSyncMode
                                                )
                                            }
                                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                                        >
                                            <option value="hidden">
                                                {t(
                                                    'profile.google.modeHidden',
                                                    'Hidden'
                                                )}
                                            </option>
                                            <option value="read">
                                                {t(
                                                    'profile.google.modeRead',
                                                    'Read only'
                                                )}
                                            </option>
                                            <option
                                                value="two_way"
                                                disabled={!calendar.can_write}
                                            >
                                                {t(
                                                    'profile.google.modeTwoWay',
                                                    'Two-way'
                                                )}
                                            </option>
                                        </select>
                                        {calendar.sync_mode !== 'hidden' && (
                                            <Switch
                                                checked={
                                                    calendar.show_on_calendar
                                                }
                                                label={t(
                                                    'profile.calendars.showOnCalendar',
                                                    'Show {{name}} on the Calendar page and Today',
                                                    { name: calendar.name }
                                                )}
                                                onChange={() =>
                                                    void toggleCalendar(
                                                        calendar
                                                    )
                                                }
                                            />
                                        )}
                                    </div>
                                ))}
                        </div>
                    )}

                    <div>
                        <button
                            type="button"
                            aria-expanded={logOpen}
                            onClick={toggleLog}
                            className="text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
                        >
                            {logOpen ? '▾ ' : '▸ '}
                            {t('profile.google.log', 'Sync log')}
                        </button>
                        {logOpen && logEntries && (
                            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                                {logEntries.length === 0 && (
                                    <li className="text-gray-500 dark:text-gray-400">
                                        {t(
                                            'profile.google.logEmpty',
                                            'Nothing recorded yet'
                                        )}
                                    </li>
                                )}
                                {logEntries.map((entry, index) => (
                                    <li
                                        key={`${entry.created_at}-${index}`}
                                        className="flex gap-2"
                                    >
                                        <span className="shrink-0 text-gray-500 dark:text-gray-400">
                                            {new Date(
                                                entry.created_at
                                            ).toLocaleString()}
                                        </span>
                                        <span
                                            className={`shrink-0 font-medium ${
                                                entry.kind === 'error'
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : entry.kind === 'conflict'
                                                      ? 'text-amber-700 dark:text-amber-400'
                                                      : 'text-gray-600 dark:text-gray-300'
                                            }`}
                                        >
                                            {kindLabel(entry.kind)}
                                        </span>
                                        <span className="min-w-0 break-words text-gray-800 dark:text-gray-200">
                                            {entry.task_uid ? (
                                                <a
                                                    href={`/task/${entry.task_uid}`}
                                                    className="hover:underline"
                                                >
                                                    {entry.message}
                                                </a>
                                            ) : (
                                                entry.message
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                void run(async () => {
                                    const next = await syncGoogleNow();
                                    showSuccessToast(
                                        t(
                                            'profile.google.synced',
                                            'Synced with Google'
                                        )
                                    );
                                    return next;
                                })
                            }
                            className={`${buttonClass} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200`}
                        >
                            {busy
                                ? t('profile.google.syncing', 'Syncing…')
                                : t('profile.google.syncNow', 'Sync now')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDisconnect(true)}
                            className={`${buttonClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20`}
                        >
                            {t('profile.google.disconnect', 'Disconnect')}
                        </button>
                    </div>
                </>
            )}

            {confirmDisconnect && (
                <ConfirmDialog
                    title={t(
                        'profile.google.disconnectTitle',
                        'Disconnect Google'
                    )}
                    message={t(
                        'profile.google.disconnectMessage',
                        'Stop syncing with Google? Your tasks stay in Cadence and everything already on Google stays there.'
                    )}
                    onConfirm={() => {
                        setConfirmDisconnect(false);
                        void run(disconnectGoogle);
                    }}
                    onCancel={() => setConfirmDisconnect(false)}
                    confirmButtonText={t(
                        'profile.google.disconnect',
                        'Disconnect'
                    )}
                />
            )}
        </section>
    );
};

export default GoogleSyncSection;

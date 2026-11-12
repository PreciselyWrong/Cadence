import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    OfflineState,
    dismissRejectedWrites,
    retryOfflineNow,
    startOfflineSync,
    subscribeOfflineState,
    subscribeSyncComplete,
} from '../../utils/offlineService';
import { fetchSyncStatus } from '../../utils/syncService';

// A quiet pill in the corner, shown only when there is something to know:
// the server is unreachable, changes wait to be sent, some were refused, or
// a replay left conflicts (docs/fork/WEB-OFFLINE.md). Nothing otherwise.
const OfflineStatus: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [state, setState] = useState<OfflineState | null>(null);
    const [conflicts, setConflicts] = useState(0);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        startOfflineSync();
        const stopState = subscribeOfflineState(setState);
        const stopSync = subscribeSyncComplete(async (result) => {
            if (result.applied === 0) return;
            try {
                setConflicts((await fetchSyncStatus()).conflicts.length);
            } catch {
                // the pill only says less
            }
        });
        return () => {
            stopState();
            stopSync();
        };
    }, []);

    if (!state) return null;
    const rejected = state.rejected.length;
    if (!state.offline && state.pending === 0 && !rejected && !conflicts) {
        return null;
    }

    let label: string;
    let tone: 'muted' | 'busy' | 'alert';
    if (rejected > 0) {
        label = t('offline.rejected', { count: rejected });
        tone = 'alert';
    } else if (state.offline) {
        label =
            state.pending > 0
                ? t('offline.offlinePending', { count: state.pending })
                : t('offline.offline', 'Offline');
        tone = 'muted';
    } else if (state.pending > 0) {
        label = t('offline.sending', { count: state.pending });
        tone = 'busy';
    } else {
        label = t('offline.conflicts', { count: conflicts });
        tone = 'alert';
    }

    const dot = {
        muted: 'bg-gray-400',
        busy: 'bg-blue-500 animate-pulse',
        alert: 'bg-amber-500',
    }[tone];

    const openConflicts = () => {
        setConflicts(0);
        setOpen(false);
        navigate('/profile?section=sync');
    };

    return (
        <div
            className="fixed right-4 bottom-20 md:bottom-4 z-40 flex flex-col items-end gap-2"
            role="status"
            aria-live="polite"
        >
            {open && (
                <div className="w-72 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {state.offline && (
                        <p className="mb-2">{t('offline.explain')}</p>
                    )}
                    {rejected > 0 && (
                        <>
                            <p className="mb-1 font-medium">
                                {t('offline.rejectedTitle')}
                            </p>
                            <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto">
                                {state.rejected.map((write) => (
                                    <li key={write.id} className="truncate">
                                        {write.name ||
                                            `${write.method} ${new URL(write.url).pathname}`}
                                        {write.error && (
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {' '}
                                                · {write.error}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    <div className="flex justify-end gap-2">
                        {conflicts > 0 && (
                            <button
                                type="button"
                                className="rounded-md px-2 py-1 text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-700"
                                onClick={openConflicts}
                            >
                                {t('offline.seeConflicts', {
                                    count: conflicts,
                                })}
                            </button>
                        )}
                        {rejected > 0 && (
                            <button
                                type="button"
                                className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => {
                                    dismissRejectedWrites();
                                    setOpen(false);
                                }}
                            >
                                {t('offline.dismiss', 'OK')}
                            </button>
                        )}
                        {(state.offline || state.pending > 0) && (
                            <button
                                type="button"
                                className="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={retryOfflineNow}
                            >
                                {t('offline.retry', 'Retry')}
                            </button>
                        )}
                    </div>
                </div>
            )}
            <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-white dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-200"
                aria-expanded={open}
                onClick={() =>
                    !state.offline && !state.pending && !rejected
                        ? openConflicts()
                        : setOpen((value) => !value)
                }
            >
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                {label}
            </button>
        </div>
    );
};

export default OfflineStatus;

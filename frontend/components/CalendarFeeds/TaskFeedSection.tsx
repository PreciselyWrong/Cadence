import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    createTaskFeed,
    disableTaskFeed,
    fetchTaskFeed,
    taskFeedUrl,
} from '../../utils/taskFeedService';
import { useToast } from '../Shared/ToastContext';

// Lets the user subscribe to their own dated tasks from Google Calendar,
// Apple Calendar or Outlook through a secret .ics address.
const TaskFeedSection: React.FC = () => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const [enabled, setEnabled] = useState(false);
    const [url, setUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        fetchTaskFeed()
            .then((status) => setEnabled(status.enabled))
            .catch(() => {});
    }, []);

    const run = async (
        action: () => Promise<{ enabled: boolean; path?: string }>
    ) => {
        setBusy(true);
        try {
            const status = await action();
            setEnabled(status.enabled);
            setUrl(status.path ? taskFeedUrl(status.path) : null);
        } catch {
            showErrorToast(
                t('profile.taskFeed.error', 'Could not update the task feed')
            );
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            showSuccessToast(t('profile.taskFeed.copied', 'Address copied'));
        } catch {
            // The address stays selectable in the field
        }
    };

    const buttonClass =
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50';

    return (
        <section className="mt-8 space-y-3" aria-labelledby="task-feed-title">
            <h3
                id="task-feed-title"
                className="text-sm font-semibold text-gray-800 dark:text-gray-200"
            >
                {t('profile.taskFeed.title', 'Subscribe to your tasks')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'profile.taskFeed.description',
                    'A private address that shows your open tasks with a due date in Google Calendar, Apple Calendar or Outlook. Anyone with the address can read those tasks.'
                )}
            </p>
            {url && (
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <input
                            readOnly
                            value={url}
                            aria-label={t(
                                'profile.taskFeed.address',
                                'Feed address'
                            )}
                            onFocus={(e) => e.target.select()}
                            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        />
                        <button
                            type="button"
                            onClick={copy}
                            className={`${buttonClass} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200`}
                        >
                            {t('profile.taskFeed.copy', 'Copy')}
                        </button>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t(
                            'profile.taskFeed.once',
                            'Copy it now: it is shown only once. Making a new address stops the old one.'
                        )}
                    </p>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(createTaskFeed)}
                    className={`${buttonClass} bg-primary text-primary-on hover:bg-primary/90`}
                >
                    {enabled
                        ? t('profile.taskFeed.rotate', 'Make a new address')
                        : t('profile.taskFeed.create', 'Make an address')}
                </button>
                {enabled && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(disableTaskFeed)}
                        className={`${buttonClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20`}
                    >
                        {t('profile.taskFeed.disable', 'Turn off')}
                    </button>
                )}
            </div>
        </section>
    );
};

export default TaskFeedSection;

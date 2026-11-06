import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClockIcon } from '@heroicons/react/24/outline';
import {
    TIMED_LEAD_MINUTES,
    TimedReminders,
    fetchTimedReminders,
    saveTimedReminders,
} from '../../../utils/timedRemindersService';

// Saved on its own endpoint, at once: the phone and the server read it.
const TimedRemindersCard: React.FC = () => {
    const { t } = useTranslation();
    const [settings, setSettings] = React.useState<TimedReminders | null>(null);

    React.useEffect(() => {
        fetchTimedReminders()
            .then(setSettings)
            .catch((err) =>
                console.error('Failed to load timed reminders', err)
            );
    }, []);

    if (!settings) return null;

    const update = (next: TimedReminders) => {
        const previous = settings;
        setSettings(next);
        saveTimedReminders(next).catch((err) => {
            console.error('Failed to save timed reminders', err);
            setSettings(previous);
        });
    };

    return (
        <section className="mt-8">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                <ClockIcon className="w-5 h-5 mr-2 text-blue-500" />
                {t('notifications.timedTasks.title', 'Tasks with a time')}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                {t(
                    'notifications.timedTasks.description',
                    'A task with a time rings at that time, not the day before. The phone and the computer share this setting; the channels are those of Task reminders.'
                )}
            </p>
            <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) =>
                            update({ ...settings, enabled: e.target.checked })
                        }
                    />
                    {t(
                        'notifications.timedTasks.enable',
                        'Ring for tasks with a time'
                    )}
                </label>
                {settings.enabled && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        {t('notifications.timedTasks.lead', 'When')}
                        <select
                            value={settings.lead_minutes}
                            onChange={(e) =>
                                update({
                                    ...settings,
                                    lead_minutes: Number(e.target.value),
                                })
                            }
                            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                        >
                            {TIMED_LEAD_MINUTES.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                    {minutes === 0
                                        ? t(
                                              'notifications.timedTasks.atTime',
                                              'At the time'
                                          )
                                        : t(
                                              'notifications.timedTasks.minutesBefore',
                                              '{{count}} min before',
                                              { count: minutes }
                                          )}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
        </section>
    );
};

export default TimedRemindersCard;

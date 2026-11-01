import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    BellIcon,
    BellAlertIcon,
    BellSnoozeIcon,
    FolderIcon,
    ClockIcon,
    MoonIcon,
    ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import type {
    NotificationChannels,
    NotificationPreferences,
    QuietHours,
} from '../types';
import { getCsrfToken } from '../../../utils/csrfService';
import PushDeviceCard from './PushDeviceCard';
import AppriseCard from './AppriseCard';
import WebhooksCard from './WebhooksCard';
import { PushState, countPushDevices } from '../../../utils/pushService';

interface NotificationsTabProps {
    isActive: boolean;
    notificationPreferences: NotificationPreferences | null | undefined;
    onChange: (preferences: NotificationPreferences) => void;
    quietHours: QuietHours | null | undefined;
    onQuietHoursChange: (quietHours: QuietHours) => void;
    showTelegram?: boolean;
}

// Mirrors the server defaults: the phone owns task reminders, so the desktop
// only rings for them when asked.
const channelsOf = (desktop: boolean): NotificationChannels => ({
    inApp: true,
    email: false,
    push: false,
    telegram: false,
    apprise: false,
    desktop,
});

const DEFAULT_PREFERENCES: NotificationPreferences = {
    dueTasks: channelsOf(true),
    overdueTasks: channelsOf(false),
    dueProjects: channelsOf(true),
    overdueProjects: channelsOf(false),
    deferUntil: channelsOf(true),
    taskAssigned: channelsOf(false),
    taskReminders: channelsOf(false),
    comments: channelsOf(false),
};

const DEFAULT_QUIET_HOURS: QuietHours = {
    enabled: true,
    start: '22:00',
    end: '07:00',
};

type Channel = 'inApp' | 'email' | 'push' | 'telegram' | 'apprise';
type PrefChannel = Channel | 'desktop';

interface NotificationTypeRowProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    preferences: NotificationChannels;
    onToggle: (channel: PrefChannel, value: boolean) => void;
    telegramConfigured: boolean;
    showTelegram: boolean;
    pushAvailable: boolean;
    appriseConfigured: boolean;
}

const NotificationTypeRow: React.FC<NotificationTypeRowProps> = ({
    icon: Icon,
    label,
    description,
    preferences,
    onToggle,
    telegramConfigured,
    showTelegram,
    pushAvailable,
    appriseConfigured,
}) => {
    const renderToggle = (
        channel: PrefChannel,
        isEnabled: boolean,
        isAvailable: boolean
    ) => (
        <button
            type="button"
            onClick={() => isAvailable && onToggle(channel, !isEnabled)}
            disabled={!isAvailable}
            className={`
                relative inline-flex h-5 w-9 items-center rounded-full
                transition-colors duration-200 ease-in-out
                ${isAvailable ? 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2' : 'cursor-not-allowed opacity-50'}
                ${isEnabled && isAvailable ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
            `}
            aria-label={`Toggle ${channel} for ${label}`}
        >
            <span
                className={`
                    inline-block h-3 w-3 transform rounded-full
                    bg-white transition-transform duration-200 ease-in-out
                    ${isEnabled && isAvailable ? 'translate-x-5' : 'translate-x-1'}
                `}
            />
        </button>
    );

    return (
        <tr className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
            <td className="py-4 px-4">
                <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300 flex-shrink-0" />
                    <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {label}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                            {description}
                        </div>
                    </div>
                </div>
            </td>
            <td className="py-4 px-4 text-center">
                {renderToggle('inApp', preferences.inApp, true)}
            </td>
            <td className="py-4 px-4 text-center">
                {renderToggle('push', preferences.push, pushAvailable)}
            </td>
            {showTelegram && (
                <td className="py-4 px-4 text-center">
                    {renderToggle(
                        'telegram',
                        preferences.telegram,
                        telegramConfigured
                    )}
                </td>
            )}
            <td className="py-4 px-4 text-center">
                {renderToggle(
                    'apprise',
                    preferences.apprise,
                    appriseConfigured
                )}
            </td>
            <td className="py-4 px-4 text-center">
                {renderToggle('desktop', preferences.desktop, true)}
            </td>
        </tr>
    );
};

const NotificationsTab: React.FC<NotificationsTabProps> = ({
    isActive,
    notificationPreferences,
    onChange,
    quietHours,
    onQuietHoursChange,
    showTelegram = true,
}) => {
    const { t } = useTranslation();
    const [profile, setProfile] = React.useState<any>(null);
    const [testingChannel, setTestingChannel] = React.useState<Channel | null>(
        null
    );
    const [testResult, setTestResult] = React.useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const [pushState, setPushState] = React.useState<PushState | null>(null);
    const [pushDevices, setPushDevices] = React.useState<number>(0);
    const [appriseConfigured, setAppriseConfigured] = React.useState(false);

    // Fetch profile data to check telegram configuration
    React.useEffect(() => {
        if (isActive) {
            fetch('/api/profile')
                .then((res) => res.json())
                .then((data) => setProfile(data))
                .catch((err) => console.error('Failed to fetch profile', err));
            countPushDevices()
                .then(setPushDevices)
                .catch(() => setPushDevices(0));
        }
    }, [isActive, pushState]);

    if (!isActive) return null;

    // Merge with defaults to ensure all types exist
    const preferences: NotificationPreferences = {
        ...DEFAULT_PREFERENCES,
        ...notificationPreferences,
    };

    const quiet: QuietHours = quietHours || {
        ...DEFAULT_QUIET_HOURS,
        enabled: false,
    };

    // Check if Telegram is configured
    const telegramConfigured = !!(
        profile?.telegram_bot_token && profile?.telegram_chat_id
    );

    // Push toggles work once any device of this account can receive push,
    // so they can be set from a desktop for a phone and the other way round.
    const pushAvailable = pushState === 'subscribed' || pushDevices > 0;

    const handleToggle = (
        notificationType: keyof NotificationPreferences,
        channel: PrefChannel,
        value: boolean
    ) => {
        const updatedPreferences = {
            ...preferences,
            [notificationType]: {
                ...preferences[notificationType],
                [channel]: value,
            },
        };
        onChange(updatedPreferences);
    };

    const handleTest = async (channel: Channel) => {
        setTestingChannel(channel);
        setTestResult(null);
        try {
            const response = await fetch('/api/test-notifications/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': await getCsrfToken(),
                },
                body: JSON.stringify({ channel }),
            });
            const data = await response.json().catch(() => ({}));
            setTestResult(
                response.ok
                    ? {
                          ok: true,
                          text: t(
                              'notifications.test.sent',
                              'Test sent via {{channel}}.',
                              { channel: channelLabel(channel) }
                          ),
                      }
                    : {
                          ok: false,
                          text:
                              data.error ||
                              t(
                                  'notifications.test.failed',
                                  'Could not send the test.'
                              ),
                      }
            );
        } catch {
            setTestResult({
                ok: false,
                text: t(
                    'notifications.test.failed',
                    'Could not send the test.'
                ),
            });
        } finally {
            setTestingChannel(null);
        }
    };

    const channelLabel = (channel: Channel) =>
        ({
            inApp: t('notifications.channels.inApp', 'In-app'),
            email: t('notifications.channels.email', 'Email'),
            push: t('notifications.channels.push', 'Push'),
            telegram: t('notifications.channels.telegram', 'Telegram'),
            apprise: t('notifications.channels.apprise', 'Apprise'),
        })[channel];

    const channelAvailable: Record<Channel, boolean> = {
        inApp: true,
        email: false,
        push: pushAvailable,
        telegram: telegramConfigured,
        apprise: appriseConfigured,
    };

    const renderTestButton = (channel: Channel) => (
        <button
            type="button"
            onClick={() => handleTest(channel)}
            disabled={!channelAvailable[channel] || testingChannel !== null}
            aria-label={t(
                'notifications.test.sendVia',
                'Send a test via {{channel}}',
                {
                    channel: channelLabel(channel),
                }
            )}
            className="px-2.5 py-1 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
            {testingChannel === channel
                ? t('notifications.test.sending', 'Sending...')
                : t('notifications.test.button', 'Test')}
        </button>
    );

    return (
        <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                <BellIcon className="w-6 h-6 mr-3 text-purple-500" />
                {t('profile.tabs.notifications', 'Notifications')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                {t(
                    'profile.notificationsDescription',
                    'Choose how you want to be notified about important events.'
                )}
            </p>

            <PushDeviceCard onStateChange={setPushState} />

            <AppriseCard onStateChange={setAppriseConfigured} />

            {/* Notifications Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {t(
                                    'notifications.table.type',
                                    'Notification Type'
                                )}
                            </th>
                            <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {t('notifications.channels.inApp', 'In-app')}
                            </th>
                            <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {t('notifications.channels.push', 'Push')}
                            </th>
                            {showTelegram && (
                                <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    {t(
                                        'notifications.channels.telegram',
                                        'Telegram'
                                    )}
                                </th>
                            )}
                            <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {t('notifications.channels.apprise', 'Apprise')}
                            </th>
                            <th className="py-3 px-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {t('notifications.channels.desktop', 'Desktop')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <NotificationTypeRow
                            icon={BellAlertIcon}
                            label={t(
                                'notifications.types.dueTasks',
                                'Due Tasks'
                            )}
                            description={t(
                                'notifications.descriptions.dueTasks',
                                'Tasks that are due within 24 hours'
                            )}
                            preferences={preferences.dueTasks}
                            onToggle={(channel, value) =>
                                handleToggle('dueTasks', channel, value)
                            }
                            telegramConfigured={telegramConfigured}
                            showTelegram={showTelegram}
                            pushAvailable={pushAvailable}
                            appriseConfigured={appriseConfigured}
                        />
                        <NotificationTypeRow
                            icon={BellSnoozeIcon}
                            label={t(
                                'notifications.types.taskReminders',
                                'Task reminders'
                            )}
                            description={t(
                                'notifications.descriptions.taskReminders',
                                'The time you set on a task. Your phone rings; add Desktop if you want your computer to ring too'
                            )}
                            preferences={preferences.taskReminders}
                            onToggle={(channel, value) =>
                                handleToggle('taskReminders', channel, value)
                            }
                            telegramConfigured={telegramConfigured}
                            showTelegram={showTelegram}
                            pushAvailable={pushAvailable}
                            appriseConfigured={appriseConfigured}
                        />
                        <NotificationTypeRow
                            icon={ClockIcon}
                            label={t(
                                'notifications.types.deferUntil',
                                'Defer Until'
                            )}
                            description={t(
                                'notifications.descriptions.deferUntil',
                                'Tasks that are now available to work on'
                            )}
                            preferences={preferences.deferUntil}
                            onToggle={(channel, value) =>
                                handleToggle('deferUntil', channel, value)
                            }
                            telegramConfigured={telegramConfigured}
                            showTelegram={showTelegram}
                            pushAvailable={pushAvailable}
                            appriseConfigured={appriseConfigured}
                        />
                        <NotificationTypeRow
                            icon={BellIcon}
                            label={t(
                                'notifications.types.taskAssigned',
                                'Task Assigned'
                            )}
                            description={t(
                                'notifications.descriptions.taskAssigned',
                                'A task was assigned to you by someone else'
                            )}
                            preferences={preferences.taskAssigned}
                            onToggle={(channel, value) =>
                                handleToggle('taskAssigned', channel, value)
                            }
                            telegramConfigured={telegramConfigured}
                            showTelegram={showTelegram}
                            pushAvailable={pushAvailable}
                            appriseConfigured={appriseConfigured}
                        />
                        <NotificationTypeRow
                            icon={ChatBubbleLeftRightIcon}
                            label={t(
                                'notifications.types.comments',
                                'Comments & Mentions'
                            )}
                            description={t(
                                'notifications.descriptions.comments',
                                'Replies, comments on your tasks, and @mentions'
                            )}
                            preferences={preferences.comments}
                            onToggle={(channel, value) =>
                                handleToggle('comments', channel, value)
                            }
                            telegramConfigured={telegramConfigured}
                            showTelegram={showTelegram}
                            pushAvailable={pushAvailable}
                            appriseConfigured={appriseConfigured}
                        />
                        <NotificationTypeRow
                            icon={FolderIcon}
                            label={t(
                                'notifications.types.dueProjects',
                                'Due Projects'
                            )}
                            description={t(
                                'notifications.descriptions.dueProjects',
                                'Projects that are due within 24 hours'
                            )}
                            preferences={preferences.dueProjects}
                            onToggle={(channel, value) =>
                                handleToggle('dueProjects', channel, value)
                            }
                            telegramConfigured={telegramConfigured}
                            showTelegram={showTelegram}
                            pushAvailable={pushAvailable}
                            appriseConfigured={appriseConfigured}
                        />
                    </tbody>
                    <tfoot>
                        <tr>
                            <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-300">
                                {t(
                                    'notifications.test.rowLabel',
                                    'Send a test notification'
                                )}
                            </td>
                            {(['inApp', 'push', 'telegram', 'apprise'] as const)
                                .filter(
                                    (channel) =>
                                        showTelegram || channel !== 'telegram'
                                )
                                .map((channel) => (
                                    <td
                                        key={channel}
                                        className="py-4 px-4 text-center"
                                    >
                                        {renderTestButton(channel)}
                                    </td>
                                ))}
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
            {testResult && (
                <p
                    role="status"
                    className={`mt-2 px-4 text-sm ${testResult.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
                >
                    {testResult.text}
                </p>
            )}

            <WebhooksCard />

            <section className="mt-8">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                    <MoonIcon className="w-5 h-5 mr-2 text-purple-500" />
                    {t('notifications.quietHours.title', 'Quiet hours')}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    {t(
                        'notifications.quietHours.description',
                        'During this window nothing rings: push, Telegram, Apprise and desktop notifications wait until it ends. You still find them in the app. Times follow your profile timezone.'
                    )}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                            type="checkbox"
                            checked={quiet.enabled}
                            onChange={(e) =>
                                onQuietHoursChange({
                                    ...(quietHours || DEFAULT_QUIET_HOURS),
                                    enabled: e.target.checked,
                                })
                            }
                            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                        />
                        {t('notifications.quietHours.enable', 'Quiet hours')}
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        {t('notifications.quietHours.from', 'From')}
                        <input
                            type="time"
                            value={quiet.start}
                            disabled={!quiet.enabled}
                            onChange={(e) =>
                                onQuietHoursChange({
                                    ...quiet,
                                    start: e.target.value,
                                })
                            }
                            className="px-2 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-50"
                        />
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        {t('notifications.quietHours.to', 'To')}
                        <input
                            type="time"
                            value={quiet.end}
                            disabled={!quiet.enabled}
                            onChange={(e) =>
                                onQuietHoursChange({
                                    ...quiet,
                                    end: e.target.value,
                                })
                            }
                            className="px-2 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-50"
                        />
                    </label>
                </div>
            </section>

            <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'notifications.info.phoneRings',
                    'Task reminders ring on your phone. The desktop only rings for them if you turn on Desktop for that row.'
                )}
            </p>
        </div>
    );
};

export default NotificationsTab;

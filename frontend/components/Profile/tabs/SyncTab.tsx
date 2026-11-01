import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useToast } from '../../Shared/ToastContext';
import {
    SyncConflict,
    SyncConflictSide,
    SyncStatus,
    countPendingWebChanges,
    fetchSyncStatus,
    resolveSyncConflict,
} from '../../../utils/syncService';
import { getCurrentLocale } from '../../../utils/dateUtils';

interface SyncTabProps {
    isActive: boolean;
}

// English fallbacks; the translations live under profile.sync.entity.* and
// profile.sync.field.*. Same wording as the Android conflict list.
const ENTITY_LABELS: Record<string, string> = {
    task: 'Task',
    project: 'Project',
    area: 'Area',
    goal: 'Goal',
    tag: 'Tag',
    note: 'Note',
    inbox_item: 'Idea',
    link: 'Link',
};

const FIELD_LABELS: Record<string, string> = {
    name: 'Title',
    title: 'Title',
    note: 'Note',
    content: 'Content',
    description: 'Description',
    priority: 'Priority',
    status: 'Status',
    due_date: 'Due date',
    start_date: 'Start',
    completed_at: 'Completed on',
    project_uid: 'Project',
    parent_project_uid: 'Parent project',
    area_uid: 'Area',
    goal_uid: 'Goal',
    parent_task_uid: 'Parent task',
    next_task_uid: 'Next action',
    tag_uids: 'Tags',
    color: 'Colour',
    icon: 'Icon',
    recurrence_type: 'Repeat',
    estimated_minutes: 'Duration',
    week_of: 'Week',
    in_view_at: 'In view',
    review_on: 'Review on',
    review_at: 'Review on',
};

const VALUE_MAX = 200;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const readable = (key: string) => key.replace(/_/g, ' ');

const SyncTab: React.FC<SyncTabProps> = ({ isActive }) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [pending, setPending] = useState<number | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            setStatus(await fetchSyncStatus());
        } catch {
            showErrorToast(
                t('profile.sync.loadError', 'Could not load the sync status')
            );
        }
    }, [showErrorToast, t]);

    useEffect(() => {
        if (!isActive) return;
        load();
        countPendingWebChanges().then(setPending);
    }, [isActive]);

    if (!isActive) return null;

    const ago = (iso: string) =>
        formatDistanceToNow(new Date(iso), {
            addSuffix: true,
            locale: getCurrentLocale(),
        });

    const render = (side: SyncConflictSide): string => {
        if (side.label) return side.label;
        const { value } = side;
        const empty = t('profile.sync.empty', '(empty)');
        if (value === null || value === undefined || value === '') return empty;
        if (Array.isArray(value)) {
            return value.length ? value.map(String).join(', ') : empty;
        }
        if (typeof value === 'boolean') {
            return value
                ? t('profile.sync.yes', 'yes')
                : t('profile.sync.no', 'no');
        }
        if (typeof value === 'object') return JSON.stringify(value);
        const text = String(value);
        if (ISO_INSTANT.test(text) && !Number.isNaN(Date.parse(text))) {
            return new Date(text).toLocaleString();
        }
        return text.slice(0, VALUE_MAX);
    };

    const resolve = async (
        conflict: SyncConflict,
        keep: 'lost' | 'current'
    ) => {
        setBusyId(conflict.id);
        try {
            await resolveSyncConflict(conflict.id, keep);
            await load();
        } catch (error) {
            showErrorToast(
                (error as Error).message ||
                    t(
                        'profile.sync.resolveError',
                        'Could not settle that conflict'
                    )
            );
        } finally {
            setBusyId(null);
        }
    };

    const conflicts = status?.conflicts ?? [];
    const devices = status?.devices ?? [];
    const button =
        'rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700';

    return (
        <div>
            <h3 className="mb-6 flex items-center text-xl font-semibold text-gray-900 dark:text-white">
                <ArrowPathIcon className="mr-3 h-6 w-6 text-blue-500" />
                {t('profile.sync.title', 'Sync')}
            </h3>

            <section className="mb-6 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60">
                <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                    {t('profile.sync.devices', 'Devices')}
                </h4>
                {status && devices.length === 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            'profile.sync.noDevices',
                            'No device has synced yet. Connect the phone or the Linux app from API Keys.'
                        )}
                    </p>
                )}
                {devices.length > 0 && (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {devices.map((device) => (
                            <li
                                key={device.id}
                                className="flex items-baseline justify-between gap-4 py-2 text-sm"
                            >
                                <span className="min-w-0 truncate text-gray-900 dark:text-gray-100">
                                    {device.name}
                                </span>
                                <span className="shrink-0 text-gray-500 dark:text-gray-400">
                                    {t('profile.sync.lastSeen', {
                                        defaultValue: 'Synced {{ago}}',
                                        ago: ago(device.last_used_at),
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {status?.last_change_at && (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        {t('profile.sync.lastChange', {
                            defaultValue: 'Last change on the server {{ago}}',
                            ago: ago(status.last_change_at),
                        })}
                    </p>
                )}
                {pending !== null && pending > 0 && (
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                        {t('profile.sync.pending', {
                            defaultValue:
                                '{{count}} changes made offline in this browser are waiting to be sent.',
                            count: pending,
                        })}
                    </p>
                )}
            </section>

            {conflicts.length > 0 && (
                <section className="mb-6 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60">
                    <h4 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {t('profile.sync.conflicts', 'Conflicts')}
                    </h4>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            'profile.sync.conflictsHint',
                            'A device sent a value older than the one on the server, which kept its own. Choose the one that stays.'
                        )}
                    </p>
                    <ul className="space-y-4">
                        {conflicts.map((conflict) => {
                            const heading = [
                                t(
                                    `profile.sync.entity.${conflict.entity}`,
                                    ENTITY_LABELS[conflict.entity] ??
                                        readable(conflict.entity)
                                ),
                                conflict.name ? `“${conflict.name}”` : null,
                                t(
                                    `profile.sync.field.${conflict.field}`,
                                    FIELD_LABELS[conflict.field] ??
                                        readable(conflict.field)
                                ),
                            ]
                                .filter(Boolean)
                                .join(' · ');
                            const busy = busyId === conflict.id;
                            return (
                                <li key={conflict.id} className="text-sm">
                                    <p className="text-gray-900 dark:text-gray-100">
                                        {heading}
                                    </p>
                                    <p className="mt-1 text-gray-700 dark:text-gray-200">
                                        {t('profile.sync.lost', {
                                            defaultValue:
                                                'Set aside: {{value}}',
                                            value: render(conflict.lost),
                                        })}
                                    </p>
                                    <p className="text-gray-500 dark:text-gray-400">
                                        {t('profile.sync.current', {
                                            defaultValue: 'Kept: {{value}}',
                                            value: render(conflict.current),
                                        })}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {conflict.can_keep_lost ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className={button}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        resolve(
                                                            conflict,
                                                            'lost'
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'profile.sync.keepLost',
                                                        'Keep this value'
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={button}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        resolve(
                                                            conflict,
                                                            'current'
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'profile.sync.keepCurrent',
                                                        'Keep the other'
                                                    )}
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                className={button}
                                                disabled={busy}
                                                onClick={() =>
                                                    resolve(conflict, 'current')
                                                }
                                            >
                                                {t(
                                                    'profile.sync.dismiss',
                                                    'Got it'
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default SyncTab;

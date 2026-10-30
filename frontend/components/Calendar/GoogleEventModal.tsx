import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format } from 'date-fns';
import {
    XMarkIcon,
    ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import {
    GoogleCalendar,
    GoogleEventInput,
} from '../../utils/googleSyncService';

export interface GoogleEventDraft {
    // Set when editing an existing event.
    calendarUid?: string;
    eventId?: string;
    title: string;
    allDay: boolean;
    start: Date;
    // Exclusive for all-day events.
    end: Date;
    location?: string | null;
    description?: string | null;
    htmlLink?: string | null;
    recurring?: boolean;
}

interface GoogleEventModalProps {
    draft: GoogleEventDraft;
    calendars: GoogleCalendar[];
    onSave: (calendarUid: string, input: GoogleEventInput) => Promise<void>;
    onDelete?: () => Promise<void>;
    onClose: () => void;
}

const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

const toLocalInput = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");
const toDayInput = (date: Date) => format(date, 'yyyy-MM-dd');
const parseDay = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
};

// Creates or edits an event of a writable Google calendar.
const GoogleEventModal: React.FC<GoogleEventModalProps> = ({
    draft,
    calendars,
    onSave,
    onDelete,
    onClose,
}) => {
    const { t } = useTranslation();
    const writable = calendars.filter((c) => c.writable);
    const editing = Boolean(draft.eventId);
    const [calendarUid, setCalendarUid] = useState(
        draft.calendarUid ||
            writable.find((c) => c.is_primary)?.uid ||
            writable[0]?.uid ||
            ''
    );
    const [title, setTitle] = useState(draft.title);
    const [allDay, setAllDay] = useState(draft.allDay);
    const [start, setStart] = useState(
        draft.allDay ? toDayInput(draft.start) : toLocalInput(draft.start)
    );
    const [end, setEnd] = useState(
        draft.allDay
            ? toDayInput(addDays(draft.end, -1))
            : toLocalInput(draft.end)
    );
    const [location, setLocation] = useState(draft.location || '');
    const [description, setDescription] = useState(draft.description || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const switchAllDay = () => {
        const next = !allDay;
        setAllDay(next);
        if (next) {
            setStart(start.slice(0, 10));
            setEnd(end.slice(0, 10));
        } else {
            setStart(`${start.slice(0, 10)}T09:00`);
            setEnd(`${end.slice(0, 10)}T10:00`);
        }
    };

    const save = async () => {
        if (!calendarUid) return;
        const input: GoogleEventInput = {
            title,
            location,
            description,
            all_day: allDay,
        };
        if (allDay) {
            const endDay = end && end >= start ? end : start;
            input.start_date = start;
            input.end_date = toDayInput(addDays(parseDay(endDay), 1));
        } else {
            const startAt = new Date(start);
            const endAt = end ? new Date(end) : startAt;
            if (endAt < startAt) {
                setError(
                    t(
                        'calendar.google.endBeforeStart',
                        'The end is before the start'
                    )
                );
                return;
            }
            input.start = startAt.toISOString();
            input.end = endAt.toISOString();
        }
        setSaving(true);
        setError(null);
        try {
            await onSave(calendarUid, input);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!onDelete) return;
        setSaving(true);
        try {
            await onDelete();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={
                    editing
                        ? t('calendar.google.editEvent', 'Edit event')
                        : t('calendar.google.newEvent', 'New event')
                }
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {editing
                            ? t('calendar.google.editEvent', 'Edit event')
                            : t('calendar.google.newEvent', 'New event')}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('calendar.close', 'Close')}
                        className="p-1 rounded-lg text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>

                <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('calendar.google.title', 'Title')}
                    aria-label={t('calendar.google.title', 'Title')}
                    className={inputClass}
                />

                <select
                    value={calendarUid}
                    onChange={(e) => setCalendarUid(e.target.value)}
                    disabled={editing}
                    aria-label={t('calendar.google.calendar', 'Calendar')}
                    className={inputClass}
                >
                    {writable.map((calendar) => (
                        <option key={calendar.uid} value={calendar.uid}>
                            {calendar.name}
                        </option>
                    ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                        type="checkbox"
                        checked={allDay}
                        onChange={switchAllDay}
                    />
                    {t('calendar.google.allDay', 'All day')}
                </label>

                <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                        {t('calendar.google.start', 'Start')}
                        <input
                            type={allDay ? 'date' : 'datetime-local'}
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                            className={inputClass}
                        />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-300">
                        {t('calendar.google.end', 'End')}
                        <input
                            type={allDay ? 'date' : 'datetime-local'}
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                            className={inputClass}
                        />
                    </label>
                </div>

                <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('calendar.google.location', 'Location')}
                    aria-label={t('calendar.google.location', 'Location')}
                    className={inputClass}
                />
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder={t(
                        'calendar.google.description',
                        'Description'
                    )}
                    aria-label={t('calendar.google.description', 'Description')}
                    className={inputClass}
                />

                {draft.recurring && (
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                        {t(
                            'calendar.google.recurringNote',
                            'Repeating event: changes apply to this occurrence only. Edit the series in Google Calendar.'
                        )}
                    </p>
                )}
                {error && (
                    <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                    >
                        {error}
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                        type="button"
                        disabled={saving || !calendarUid}
                        onClick={() => void save()}
                        className="inline-flex min-h-[36px] items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-on hover:bg-primary/90 disabled:opacity-50"
                    >
                        {t('calendar.google.save', 'Save')}
                    </button>
                    {editing && onDelete && (
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void remove()}
                            className="inline-flex min-h-[36px] items-center rounded-md px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                            {t('calendar.google.delete', 'Delete')}
                        </button>
                    )}
                    {draft.htmlLink && (
                        <a
                            href={draft.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                            {t(
                                'calendar.google.openInGoogle',
                                'Open in Google'
                            )}
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GoogleEventModal;

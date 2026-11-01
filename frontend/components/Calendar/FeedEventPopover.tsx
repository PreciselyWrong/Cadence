import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ClipboardDocumentIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { useToast } from '../Shared/ToastContext';
import { getCurrentLocale } from '../../utils/dateUtils';
import { findMeetingLink, locationHref } from './eventLocation';

export interface FeedEventDetail {
    title: string;
    calendarName: string;
    // The day the piece of the event is drawn on.
    day: Date;
    start: Date | null;
    end: Date | null;
    allDay: boolean;
    location: string | null;
    description: string | null;
}

interface FeedEventPopoverProps {
    detail: FeedEventDetail;
    onClose: () => void;
}

// A read-only card for an event of an ICS feed: the feed is not ours to
// edit, so the event shows what it says and where to go.
const FeedEventPopover: React.FC<FeedEventPopoverProps> = ({
    detail,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const location = detail.location?.trim() ?? '';
    const meetingLink = findMeetingLink(location, detail.description);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const timeLine =
        detail.allDay || !detail.start || !detail.end
            ? t('calendar.feed.allDay', 'All day')
            : `${format(detail.start, 'HH:mm')}–${format(detail.end, 'HH:mm')}`;

    const copyLocation = async () => {
        try {
            await navigator.clipboard.writeText(location);
            showSuccessToast(t('calendar.location.copied', 'Address copied'));
        } catch {
            showErrorToast(
                t('calendar.location.copyError', 'Could not copy the address')
            );
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
                aria-labelledby="feed-event-title"
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5 space-y-3 text-sm"
                onClick={(event) => event.stopPropagation()}
            >
                <h2
                    id="feed-event-title"
                    className="text-base font-semibold text-gray-900 dark:text-gray-100"
                >
                    {detail.title}
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                    <span>
                        {format(detail.day, 'EEEE d MMMM', {
                            locale: getCurrentLocale(),
                        })}
                    </span>
                    {' · '}
                    <span>{timeLine}</span>
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                    {detail.calendarName}
                </p>
                {location && (
                    <div className="flex items-center gap-2">
                        <MapPinIcon className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                        <a
                            href={locationHref(location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 truncate text-blue-600 hover:underline dark:text-blue-400"
                        >
                            {location}
                        </a>
                        <button
                            type="button"
                            onClick={copyLocation}
                            title={t('calendar.location.copy', 'Copy address')}
                            aria-label={t(
                                'calendar.location.copy',
                                'Copy address'
                            )}
                            className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        >
                            <ClipboardDocumentIcon className="h-4 w-4" />
                        </button>
                    </div>
                )}
                {meetingLink && (
                    <a
                        href={meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        {t('calendar.meetingJoin', 'Join')}
                    </a>
                )}
                {detail.description?.trim() && (
                    <p className="whitespace-pre-line text-gray-700 dark:text-gray-300">
                        {detail.description.trim()}
                    </p>
                )}
                <div className="flex justify-end pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        {t('calendar.feed.close', 'Close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FeedEventPopover;

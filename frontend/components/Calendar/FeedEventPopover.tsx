import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
    ArrowTopRightOnSquareIcon,
    CalendarDaysIcon,
    ClipboardDocumentIcon,
    MapPinIcon,
    PencilSquareIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import Button, { IconButton } from '../Shared/ui/Button';
import { useToast } from '../Shared/ToastContext';
import { getCurrentLocale } from '../../utils/dateUtils';
import { findMeetingLink, locationHref } from './eventLocation';
import { eventDescriptionText } from './eventDescription';

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
    // The event's page in Google Calendar, when it has one.
    htmlLink?: string | null;
}

interface FeedEventPopoverProps {
    detail: FeedEventDetail;
    onClose: () => void;
    // A writable event: « Edit » opens the editor.
    onEdit?: () => void;
}

// What a click on an event shows first, on every page: what it says and
// where to go; « Edit » only for an event Cadence may write.
const FeedEventPopover: React.FC<FeedEventPopoverProps> = ({
    detail,
    onClose,
    onEdit,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const location = detail.location?.trim() ?? '';
    const description = eventDescriptionText(detail.description);
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
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="feed-event-title"
                className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/10 dark:bg-surface-card dark:ring-white/10"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-3 border-b border-outline-variant/60 px-5 py-4">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-500" />
                    <div className="min-w-0 flex-1">
                        <h2
                            id="feed-event-title"
                            className="break-words text-title-m font-semibold text-surface-on"
                        >
                            {detail.title}
                        </h2>
                        <p className="mt-0.5 text-body-m text-surface-on-variant">
                            <span className="first-letter:uppercase">
                                {format(detail.day, 'EEEE d MMMM', {
                                    locale: getCurrentLocale(),
                                })}
                            </span>
                            {' · '}
                            <span className="tabular-nums">{timeLine}</span>
                        </p>
                    </div>
                    <IconButton
                        label={t('calendar.feed.close', 'Close')}
                        onClick={onClose}
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </div>
                <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4 text-body-m">
                    <p className="flex items-center gap-2 text-surface-on-variant">
                        <CalendarDaysIcon className="h-4 w-4 shrink-0" />
                        {detail.calendarName}
                    </p>
                    {location && (
                        <div className="flex items-center gap-2">
                            <MapPinIcon className="h-4 w-4 shrink-0 text-surface-on-variant" />
                            <a
                                href={locationHref(location)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-primary hover:underline"
                            >
                                {location}
                            </a>
                            <button
                                type="button"
                                onClick={copyLocation}
                                title={t(
                                    'calendar.location.copy',
                                    'Copy address'
                                )}
                                aria-label={t(
                                    'calendar.location.copy',
                                    'Copy address'
                                )}
                                className="shrink-0 rounded-md p-1 text-surface-on-variant hover:bg-surface-high hover:text-surface-on"
                            >
                                <ClipboardDocumentIcon className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                    {description && (
                        <p className="whitespace-pre-line break-words text-surface-on">
                            {description}
                        </p>
                    )}
                </div>
                {(meetingLink || detail.htmlLink || onEdit) && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant/60 px-5 py-3">
                        {detail.htmlLink && (
                            <a
                                href={detail.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-body-m text-surface-on-variant hover:bg-surface-high hover:text-surface-on"
                            >
                                {t(
                                    'calendar.feed.openGoogle',
                                    'Open in Google Calendar'
                                )}
                                <ArrowTopRightOnSquareIcon
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                />
                            </a>
                        )}
                        {onEdit && (
                            <Button variant="secondary" onClick={onEdit}>
                                <PencilSquareIcon
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                                {t('calendar.feed.edit', 'Edit')}
                            </Button>
                        )}
                        {meetingLink && (
                            <a
                                href={meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-body-m font-medium text-primary-on hover:bg-primary/90"
                            >
                                {t('calendar.meetingJoin', 'Join')}
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeedEventPopover;

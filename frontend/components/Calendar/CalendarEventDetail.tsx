import React, { useState } from 'react';
import { parseISO } from 'date-fns';
import type { CalendarEvent } from '../../utils/calendarFeedsService';
import {
    deleteGoogleEvent,
    updateGoogleEvent,
} from '../../utils/googleSyncService';
import FeedEventPopover from './FeedEventPopover';
import GoogleEventModal, { GoogleEventDraft } from './GoogleEventModal';

const dayOf = (value: string) => {
    const [year, month, date] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, date);
};

// The editor's draft for an event of a Google calendar Cadence may write to;
// null for any other event (an iCal feed, a read-only Google calendar).
export const editableGoogleDraft = (
    event: CalendarEvent
): GoogleEventDraft | null => {
    if (
        event.source !== 'google' ||
        !event.editable ||
        !event.calendar_uid ||
        !event.event_id
    ) {
        return null;
    }
    return {
        calendarUid: event.calendar_uid,
        eventId: event.event_id,
        title: event.title,
        allDay: event.all_day,
        start: event.all_day ? dayOf(event.start) : new Date(event.start),
        end: event.all_day ? dayOf(event.end) : new Date(event.end),
        location: event.location ?? null,
        description: event.description ?? null,
        htmlLink: event.html_link ?? null,
        recurring: event.recurring,
    };
};

interface CalendarEventDetailProps {
    event: CalendarEvent;
    // The day the clicked piece of the event is drawn on.
    onDate: string;
    onClose: () => void;
    // After a save or a delete, so the page reloads its events.
    onChanged: () => void;
}

// What a click on an event opens, on every page that draws a calendar: the
// read card, with « Edit » to the editor (and Delete) for a writable Google
// calendar.
const CalendarEventDetail: React.FC<CalendarEventDetailProps> = ({
    event,
    onDate,
    onClose,
    onChanged,
}) => {
    const draft = editableGoogleDraft(event);
    // A click shows the event; the editor opens only on « Edit ».
    const [editing, setEditing] = useState(false);
    if (editing && draft?.calendarUid && draft.eventId) {
        const { calendarUid, eventId } = draft;
        return (
            <GoogleEventModal
                draft={draft}
                calendars={[]}
                onClose={onClose}
                onSave={async (_calendar, input) => {
                    await updateGoogleEvent(calendarUid, eventId, input);
                    onChanged();
                }}
                onDelete={async () => {
                    await deleteGoogleEvent(calendarUid, eventId);
                    onChanged();
                }}
            />
        );
    }
    return (
        <FeedEventPopover
            detail={{
                title: event.title,
                calendarName: event.feed_name,
                day: parseISO(onDate),
                start: event.start ? new Date(event.start) : null,
                end: event.end ? new Date(event.end) : null,
                allDay: event.all_day,
                location: event.location ?? null,
                description: event.description ?? null,
                htmlLink: event.html_link ?? null,
            }}
            onClose={onClose}
            onEdit={draft ? () => setEditing(true) : undefined}
        />
    );
};

export default CalendarEventDetail;

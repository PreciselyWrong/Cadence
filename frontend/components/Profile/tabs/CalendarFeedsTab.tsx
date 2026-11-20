import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { useToast } from '../../Shared/ToastContext';
import CalendarFeedsManager from '../../CalendarFeeds/CalendarFeedsManager';
import {
    CalendarFeed,
    fetchCalendarFeeds,
} from '../../../utils/calendarFeedsService';
import {
    fetchGoogleStatus,
    GoogleStatus,
} from '../../../utils/googleSyncService';

interface CalendarFeedsTabProps {
    isActive: boolean;
}

const CalendarFeedsTab: React.FC<CalendarFeedsTabProps> = ({ isActive }) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
    const [loading, setLoading] = useState(false);
    // Google Calendar and Tasks: connect, reconnect and settings live here too.
    const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);

    useEffect(() => {
        if (!isActive) return;
        setLoading(true);
        fetchCalendarFeeds()
            .then(setFeeds)
            .catch(() =>
                showErrorToast(
                    t('profile.calendars.loadError', 'Could not load calendars')
                )
            )
            .finally(() => setLoading(false));
        fetchGoogleStatus()
            .then(setGoogleStatus)
            .catch(() => setGoogleStatus(null));
    }, [isActive]);

    if (!isActive) return null;

    return (
        <div>
            <h3 className="mb-6 flex items-center text-xl font-semibold text-gray-900 dark:text-white">
                <CalendarDaysIcon className="mr-3 h-6 w-6 text-blue-500" />
                {t('profile.calendars.title', 'Calendars')}
            </h3>

            <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'profile.calendars.description',
                    'Show your meetings next to your day plan and on the Calendar page. Cadence only reads these calendars; it never changes them.'
                )}
            </p>

            <CalendarFeedsManager
                feeds={feeds}
                loading={loading}
                onFeedsChange={(update) => setFeeds(update)}
                googleStatus={googleStatus}
                onGoogleStatusChange={setGoogleStatus}
            />
        </div>
    );
};

export default CalendarFeedsTab;

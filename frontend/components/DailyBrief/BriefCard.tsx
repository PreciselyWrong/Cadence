import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getTodayDateString } from '../../utils/dateUtils';
import { capitalizeFirst } from './briefTime';
import { DailyBrief, fetchDailyBrief } from '../../utils/dailyBriefService';

// The compact brief on Today (shown when Today's "showDailyBrief" is on): the
// verdict and two counters, with a link to the full page.
const BriefCard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const date = getTodayDateString();
    const [brief, setBrief] = useState<DailyBrief | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchDailyBrief(date)
            .then((response) => {
                if (!cancelled) setBrief(response.brief);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [date]);

    const dateLabel = new Intl.DateTimeFormat(i18n?.language || 'en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(`${date}T12:00:00`));

    return (
        <section
            className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60"
            data-testid="brief-card"
            aria-label={t('dailyBrief.card.title', 'Résumé du jour')}
        >
            <p className="text-xs text-gray-600 dark:text-gray-300">
                {capitalizeFirst(dateLabel)}
            </p>
            {brief ? (
                <>
                    <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                        {brief.verdict.text}
                    </p>
                    <p className="mt-2 text-[13px] text-gray-600 dark:text-gray-300">
                        <span className="tabular-nums">
                            {brief.counters.overdue}
                        </span>{' '}
                        {t('dailyBrief.counters.overdue', 'en retard')}
                        {' · '}
                        <span className="tabular-nums">
                            {brief.counters.due_today}
                        </span>{' '}
                        {t('dailyBrief.counters.today', "aujourd'hui")}
                    </p>
                </>
            ) : (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {failed
                        ? t(
                              'dailyBrief.card.error',
                              'Le résumé est indisponible.'
                          )
                        : t(
                              'dailyBrief.empty',
                              "Pas encore de résumé pour aujourd'hui."
                          )}
                </p>
            )}
            <Link
                to="/insights/daily-brief"
                className="mt-3 inline-flex min-h-[40px] items-center text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
            >
                {t('dailyBrief.card.open', 'Voir le résumé')}
            </Link>
        </section>
    );
};

export default BriefCard;

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getUserTimezone } from '../../utils/dateUtils';
import { capitalizeFirst, isEveningTime, localClock } from './briefTime';
import {
    DailyBrief,
    DailyEvening,
    fetchBriefSettings,
    fetchDailyBrief,
    fetchDailyEvening,
} from '../../utils/dailyBriefService';

// The compact brief on Today (shown when Today's "showDailyBrief" is on): the
// verdict and two counters, with a link to the full page. After the evening
// switch time it shows the evening review instead (docs/39-daily-brief.md).
const BriefCard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [clock] = useState(() => localClock(new Date(), getUserTimezone()));
    const date = clock.date;
    const [brief, setBrief] = useState<DailyBrief | null>(null);
    const [evening, setEvening] = useState<DailyEvening | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchDailyBrief(date), fetchBriefSettings()])
            .then(async ([response, briefSettings]) => {
                if (cancelled) return;
                setBrief(response.brief);
                if (!isEveningTime(briefSettings.evening, clock.minute)) return;
                const review = await fetchDailyEvening(date);
                if (!cancelled) setEvening(review.evening);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [date, clock.minute]);

    const dateLabel = new Intl.DateTimeFormat(i18n?.language || 'en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(`${date}T12:00:00`));

    const shown = evening
        ? {
              text: evening.verdict.text,
              counters: [
                  {
                      value: evening.counters.done,
                      label: t('dailyBrief.evening.counters.done', 'faites'),
                  },
                  {
                      value: evening.counters.slipped,
                      label: t(
                          'dailyBrief.evening.counters.slipped',
                          'glissées'
                      ),
                  },
              ],
          }
        : brief && {
              text: brief.verdict.text,
              counters: [
                  {
                      value: brief.counters.overdue,
                      label: t('dailyBrief.counters.overdue', 'en retard'),
                  },
                  {
                      value: brief.counters.due_today,
                      label: t('dailyBrief.counters.today', "aujourd'hui"),
                  },
              ],
          };

    return (
        <section
            className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60"
            data-testid="brief-card"
            aria-label={t('dailyBrief.card.title', 'Ma journée')}
        >
            <p className="text-xs text-gray-600 dark:text-gray-300">
                {capitalizeFirst(dateLabel)}
            </p>
            {shown ? (
                <>
                    <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                        {shown.text}
                    </p>
                    <p className="mt-2 text-[13px] text-gray-600 dark:text-gray-300">
                        {shown.counters.map((counter, index) => (
                            <React.Fragment key={counter.label}>
                                {index > 0 && ' · '}
                                <span className="tabular-nums">
                                    {counter.value}
                                </span>{' '}
                                {counter.label}
                            </React.Fragment>
                        ))}
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
                {evening
                    ? t(
                          'dailyBrief.evening.switchToEvening',
                          'Voir le bilan du soir'
                      )
                    : t('dailyBrief.card.open', 'Voir le résumé')}
            </Link>
        </section>
    );
};

export default BriefCard;

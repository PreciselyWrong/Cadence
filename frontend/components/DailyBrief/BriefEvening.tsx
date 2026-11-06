import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    BriefSettings,
    BriefTaskState,
    DailyEvening,
} from '../../utils/dailyBriefService';
import { isTaskCompleted } from '../../constants/taskStatus';
import BriefEveningRow, {
    EveningHandled,
    EveningRowActions,
} from './BriefEveningRow';
import BriefTimeline from './BriefTimeline';
import { SectionTitle } from './BriefSections';

export interface BriefEveningActions extends EveningRowActions {
    onToggle: (uid: string) => void;
    onOpen: (uid: string) => void;
}

interface BriefEveningProps {
    evening: DailyEvening;
    tasks: Record<string, BriefTaskState>;
    settings: BriefSettings;
    locale: string;
    handled: Record<string, EveningHandled>;
    actions: BriefEveningActions;
}

// The evening review: the verdict and three counts, then what is still open
// tonight, what was done today, what slipped, and tomorrow's timeline day.
// Rows stay where they are when checked, so the undo of a completion is in place.
export const BriefEvening: React.FC<BriefEveningProps> = ({
    evening,
    tasks,
    settings,
    locale,
    handled,
    actions,
}) => {
    const { t } = useTranslation();
    const tonight = evening.tonight.filter((item) => tasks[item.task_uid]);
    const done = evening.done.filter((uid) => tasks[uid]);
    const slipped = evening.slipped.filter((item) => tasks[item.task_uid]);

    const row = (
        uid: string,
        meta: string | undefined,
        actionable: boolean
    ) => {
        const task = tasks[uid];
        return (
            <BriefEveningRow
                key={uid}
                uid={uid}
                name={task.name}
                done={isTaskCompleted(task.status)}
                status={task.status}
                meta={meta}
                dueDate={task.due_date}
                recurring={task.recurring}
                handled={handled[uid]}
                actionable={actionable}
                locale={locale}
                actions={actions}
                onToggle={() => actions.onToggle(uid)}
                onOpen={() => actions.onOpen(uid)}
            />
        );
    };

    const empty = (text: string) => (
        <p className="py-3 text-sm text-gray-600 dark:text-gray-300">{text}</p>
    );

    const counters = [
        {
            value: evening.counters.done,
            label: t('dailyBrief.evening.counters.done', 'faites'),
        },
        {
            value: tonight.length,
            label: t('dailyBrief.evening.counters.tonight', 'ce soir'),
        },
        {
            value: evening.counters.slipped,
            label: t('dailyBrief.evening.counters.slipped', 'glissées'),
        },
    ];

    const tomorrowTitle = t('dailyBrief.evening.sections.tomorrow', 'Demain');

    return (
        <div data-testid="brief-evening">
            <header className="mb-2">
                <h2 className="mt-1 text-[22px] font-semibold leading-7 tracking-tight text-gray-900 dark:text-gray-50">
                    {evening.verdict.text}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
                    {counters.map((counter) => (
                        <span key={counter.label}>
                            <b className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {counter.value}
                            </b>{' '}
                            {counter.label}
                        </span>
                    ))}
                </div>
            </header>

            <section
                aria-label={t('dailyBrief.evening.tonightTitle', 'Ce soir')}
            >
                <SectionTitle
                    title={t('dailyBrief.evening.tonightTitle', 'Ce soir')}
                />
                {tonight.length === 0
                    ? empty(
                          t(
                              'dailyBrief.evening.emptyTonight',
                              'Plus rien à faire ce soir.'
                          )
                      )
                    : tonight.map((item) =>
                          row(
                              item.task_uid,
                              [
                                  tasks[item.task_uid].project_name,
                                  t('dailyBrief.minutes', '{{count}} min', {
                                      count: item.minutes,
                                  }),
                              ]
                                  .filter(Boolean)
                                  .join(' · '),
                              true
                          )
                      )}
            </section>

            <section
                aria-label={t(
                    'dailyBrief.evening.sections.done',
                    'Fait aujourd’hui'
                )}
            >
                <SectionTitle
                    title={t(
                        'dailyBrief.evening.sections.done',
                        'Fait aujourd’hui'
                    )}
                />
                {done.length === 0
                    ? empty(
                          t(
                              'dailyBrief.evening.emptyDone',
                              'Rien de terminé aujourd’hui.'
                          )
                      )
                    : done.map((uid) => row(uid, undefined, false))}
            </section>

            <section
                aria-label={t('dailyBrief.evening.sections.slipped', 'Glisse')}
            >
                <SectionTitle
                    title={t('dailyBrief.evening.sections.slipped', 'Glisse')}
                />
                {slipped.length === 0
                    ? empty(
                          t(
                              'dailyBrief.evening.emptySlipped',
                              'Rien ne glisse.'
                          )
                      )
                    : slipped.map((item) =>
                          row(item.task_uid, item.reason, true)
                      )}
            </section>

            {evening.tomorrow && (
                <section aria-label={tomorrowTitle}>
                    <SectionTitle title={tomorrowTitle} />
                    <BriefTimeline
                        days={[evening.tomorrow]}
                        settings={settings}
                        locale={locale}
                    />
                </section>
            )}
        </div>
    );
};

export default BriefEvening;

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FORM } from '../../../constants/formClasses';
import {
    fetchCalendarFeeds,
    CalendarFeed,
} from '../../../utils/calendarFeedsService';
import {
    fetchGoogleStatus,
    GoogleCalendar,
} from '../../../utils/googleSyncService';
import {
    BriefEveningWindow,
    BriefSettings,
    BriefSettingsPatch,
    BriefStatusResponse,
    fetchBriefSettings,
    fetchBriefStatus,
    saveBriefSettings,
    saveShowDailyBrief,
} from '../../../utils/dailyBriefService';

interface DailyBriefTabProps {
    isActive: boolean;
}

// The sections of the page, in their default order.
const SECTION_IDS = [
    'verdict',
    'timeline',
    'tonight',
    'moves',
    'anticipate',
    'replies',
    'inbox',
    'resolved',
];
const ALERT_IDS = [
    'conflict',
    'overload',
    'duplicate',
    'deadline_in_note',
    'postponed',
    'dependency',
    'event_in_work_hours',
];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

const move = <T,>(list: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};

const Card: React.FC<{
    title: string;
    children: React.ReactNode;
    testId?: string;
}> = ({ title, children, testId }) => (
    <section
        className="mb-6 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60"
        data-testid={testId}
    >
        <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            {title}
        </h4>
        <div className="space-y-3">{children}</div>
    </section>
);

const Check: React.FC<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
    <label className="flex min-h-[40px] items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
        <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        {label}
    </label>
);

const weekdayLabel = (day: number, locale: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
        new Date(2026, 0, 4 + day)
    );

// Removing a weekday's evening window or note needs an explicit null in the
// patch: the server merges objects.
const buildPatch = (
    saved: BriefSettings,
    draft: BriefSettings
): BriefSettingsPatch => {
    const evening: Record<string, BriefEveningWindow | null> = {};
    Object.keys(saved.capacity.evening).forEach((day) => {
        if (!draft.capacity.evening[day]) evening[day] = null;
    });
    Object.entries(draft.capacity.evening).forEach(([day, window]) => {
        evening[day] = window;
    });
    const notes: Record<string, string | null> = {};
    Object.keys(saved.capacity.dayNotes).forEach((day) => {
        if (!draft.capacity.dayNotes[day]) notes[day] = null;
    });
    Object.entries(draft.capacity.dayNotes).forEach(([day, note]) => {
        notes[day] = note;
    });
    return {
        ...draft,
        capacity: { evening, dayNotes: notes },
    };
};

const DailyBriefTab: React.FC<DailyBriefTabProps> = ({ isActive }) => {
    const { t, i18n } = useTranslation();
    const locale = i18n?.language || 'en';
    const [saved, setSaved] = useState<BriefSettings | null>(null);
    const [draft, setDraft] = useState<BriefSettings | null>(null);
    const [status, setStatus] = useState<BriefStatusResponse | null>(null);
    const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
    const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>(
        []
    );
    const [showOnToday, setShowOnToday] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedNotice, setSavedNotice] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isActive || saved) return;
        Promise.all([
            fetchBriefSettings(),
            fetchBriefStatus().catch(() => null),
            fetchCalendarFeeds().catch(() => []),
            fetchGoogleStatus().catch(() => null),
        ])
            .then(([settings, briefStatus, calendarFeeds, google]) => {
                setSaved(settings);
                setDraft(settings);
                setStatus(briefStatus);
                setFeeds(calendarFeeds);
                setGoogleCalendars(google?.calendars ?? []);
            })
            .catch((error: Error) =>
                setLoadError(
                    error?.message ||
                        t(
                            'dailyBrief.settings.loadError',
                            'Impossible de charger le résumé.'
                        )
                )
            );
    }, [isActive, saved, t]);

    if (!draft || !saved) {
        return (
            <div className={isActive ? '' : 'hidden'}>
                {loadError ? (
                    <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                    >
                        {loadError}
                    </p>
                ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t('common.loading', 'Loading...')}
                    </p>
                )}
            </div>
        );
    }

    const update = (patch: Partial<BriefSettings>) => {
        setSavedNotice(false);
        setDraft({ ...draft, ...patch });
    };

    const save = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const next = await saveBriefSettings(buildPatch(saved, draft));
            setSaved(next);
            setDraft(next);
            setSavedNotice(true);
        } catch (error) {
            setSaveError(
                (error as Error).message ||
                    t(
                        'dailyBrief.settings.saveError',
                        'Impossible d’enregistrer les réglages.'
                    )
            );
        } finally {
            setSaving(false);
        }
    };

    const toggleToday = async (show: boolean) => {
        setShowOnToday(show);
        try {
            await saveShowDailyBrief(show);
        } catch (error) {
            setShowOnToday(!show);
            setSaveError((error as Error).message);
        }
    };

    const toggleList = (list: string[], id: string, on: boolean) =>
        on
            ? [...list.filter((item) => item !== id), id]
            : list.filter((item) => item !== id);

    const sectionOrder = [
        ...draft.sections,
        ...SECTION_IDS.filter((id) => !draft.sections.includes(id)),
    ];
    const sectionLabel = (id: string) => t(`dailyBrief.sectionName.${id}`, id);
    const priorityLabel = (id: string) => t(`dailyBrief.priority.${id}`, id);
    const alertLabel = (id: string) => t(`dailyBrief.alertType.${id}`, id);

    const calendarOptions = [
        ...feeds.map((feed) => ({ uid: feed.uid, name: feed.name })),
        ...googleCalendars.map((calendar) => ({
            uid: calendar.feed_uid,
            name: calendar.name,
        })),
    ];

    const sourceLine = (id: string) => {
        const source = status?.sources.find((item) => item.id === id);
        if (!source) return null;
        const state = !source.configured
            ? t('dailyBrief.status.missing', 'Non configuré')
            : source.working === false
              ? t('dailyBrief.status.failing', 'En erreur')
              : t('dailyBrief.status.configured', 'Configuré');
        return (
            <li
                key={id}
                className="flex flex-wrap justify-between gap-2 text-sm"
            >
                <span className="text-gray-800 dark:text-gray-200">
                    {t(`dailyBrief.source.${id}`, id)}
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                    {state}
                    {source.detail ? ` · ${source.detail}` : ''}
                </span>
            </li>
        );
    };

    return (
        <div className={isActive ? '' : 'hidden'} data-testid="daily-brief-tab">
            <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                {t('dailyBrief.settings.title', 'Résumé du jour')}
            </h3>
            <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'dailyBrief.settings.description',
                    'Un résumé chaque matin : la semaine à venir, ce qui attend ce soir, ce qui peut bouger.'
                )}
            </p>

            <Card
                title={t('dailyBrief.settings.status', 'État des sources')}
                testId="brief-status"
            >
                {status && !status.timezone_set && (
                    <p
                        role="alert"
                        className="text-sm text-amber-700 dark:text-amber-400"
                    >
                        {t(
                            'dailyBrief.settings.timezoneWarning',
                            'Le fuseau horaire n’est pas défini : les heures du résumé peuvent être fausses.'
                        )}
                    </p>
                )}
                <ul className="space-y-2">
                    {['calendar', 'mail', 'llm', 'voice', 'agent'].map(
                        sourceLine
                    )}
                </ul>
                <Check
                    label={t(
                        'dailyBrief.settings.showOnToday',
                        "Afficher le résumé sur Aujourd'hui"
                    )}
                    checked={showOnToday}
                    onChange={toggleToday}
                />
            </Card>

            <Card title={t('dailyBrief.settings.generation', 'Génération')}>
                <Check
                    label={t(
                        'dailyBrief.settings.enabled',
                        'Générer chaque matin'
                    )}
                    checked={draft.enabled}
                    onChange={(enabled) => update({ enabled })}
                />
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.time', 'Heure')}
                    <input
                        type="time"
                        step={300}
                        value={draft.time}
                        onChange={(event) =>
                            update({ time: event.target.value })
                        }
                        className={`${FORM.input} w-32`}
                    />
                </label>
                <fieldset>
                    <legend className="mb-1 text-sm text-gray-800 dark:text-gray-200">
                        {t('dailyBrief.settings.days', 'Jours')}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => (
                            <label
                                key={day}
                                className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-white px-3 text-sm dark:bg-gray-900/60"
                            >
                                <input
                                    type="checkbox"
                                    checked={draft.days.includes(day)}
                                    onChange={(event) =>
                                        update({
                                            days: event.target.checked
                                                ? [...draft.days, day].sort()
                                                : draft.days.filter(
                                                      (item) => item !== day
                                                  ),
                                        })
                                    }
                                />
                                {weekdayLabel(day, locale)}
                            </label>
                        ))}
                    </div>
                </fieldset>
            </Card>

            <Card
                title={t('dailyBrief.settings.review.title', 'Bilan du soir')}
                testId="brief-evening-settings"
            >
                <Check
                    label={t(
                        'dailyBrief.settings.review.enabled',
                        'Montrer le bilan du soir après l’heure de passage'
                    )}
                    checked={draft.evening.enabled}
                    onChange={(enabled) =>
                        update({ evening: { ...draft.evening, enabled } })
                    }
                />
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t(
                        'dailyBrief.settings.review.switchTime',
                        'Heure de passage au bilan'
                    )}
                    <input
                        type="time"
                        step={300}
                        value={draft.evening.switchTime}
                        onChange={(event) =>
                            update({
                                evening: {
                                    ...draft.evening,
                                    switchTime: event.target.value,
                                },
                            })
                        }
                        className={`${FORM.input} w-32`}
                    />
                </label>
            </Card>

            <Card title={t('dailyBrief.settings.sections', 'Sections')}>
                <ul className="space-y-1">
                    {sectionOrder.map((id, index) => (
                        <li
                            key={id}
                            data-testid={`brief-section-${id}`}
                            className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 dark:bg-gray-900/60"
                        >
                            <input
                                type="checkbox"
                                checked={draft.sections.includes(id)}
                                aria-label={sectionLabel(id)}
                                onChange={(event) =>
                                    update({
                                        sections: sectionOrder.filter((item) =>
                                            item === id
                                                ? event.target.checked
                                                : draft.sections.includes(item)
                                        ),
                                    })
                                }
                            />
                            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                                {sectionLabel(id)}
                            </span>
                            <button
                                type="button"
                                aria-label={t(
                                    'dailyBrief.settings.moveUp',
                                    'Monter {{name}}',
                                    { name: sectionLabel(id) }
                                )}
                                disabled={index === 0}
                                onClick={() =>
                                    update({
                                        sections: move(
                                            sectionOrder,
                                            index,
                                            -1
                                        ).filter((item) =>
                                            draft.sections.includes(item)
                                        ),
                                    })
                                }
                                className="h-8 rounded-md px-2 text-sm disabled:opacity-30"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                aria-label={t(
                                    'dailyBrief.settings.moveDown',
                                    'Descendre {{name}}',
                                    { name: sectionLabel(id) }
                                )}
                                disabled={index === sectionOrder.length - 1}
                                onClick={() =>
                                    update({
                                        sections: move(
                                            sectionOrder,
                                            index,
                                            1
                                        ).filter((item) =>
                                            draft.sections.includes(item)
                                        ),
                                    })
                                }
                                className="h-8 rounded-md px-2 text-sm disabled:opacity-30"
                            >
                                ↓
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                    {t(
                        'dailyBrief.settings.sectionsHint',
                        'Une section décochée est masquée ; l’ordre reste celui de la liste.'
                    )}
                </p>
            </Card>

            <Card title={t('dailyBrief.settings.sources', 'Calendriers lus')}>
                {calendarOptions.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            'dailyBrief.settings.noCalendars',
                            'Aucun calendrier. Ajoutez-en dans Profil › Calendriers.'
                        )}
                    </p>
                ) : (
                    calendarOptions.map((calendar) => (
                        <Check
                            key={calendar.uid}
                            label={calendar.name}
                            checked={draft.calendarFeedUids.includes(
                                calendar.uid
                            )}
                            onChange={(on) =>
                                update({
                                    calendarFeedUids: toggleList(
                                        draft.calendarFeedUids,
                                        calendar.uid,
                                        on
                                    ),
                                })
                            }
                        />
                    ))
                )}
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.lookahead', 'Jours à regarder')}
                    <input
                        type="number"
                        min={1}
                        max={14}
                        value={draft.calendarLookaheadDays}
                        onChange={(event) =>
                            update({
                                calendarLookaheadDays: Number(
                                    event.target.value
                                ),
                            })
                        }
                        className={`${FORM.input} w-24`}
                    />
                </label>
            </Card>

            <Card title={t('dailyBrief.settings.evening', 'Soir et charge')}>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                    {t(
                        'dailyBrief.settings.eveningHint',
                        'Les heures de travail se règlent dans Aujourd’hui (blocs de focus).'
                    )}{' '}
                    <Link to="/today" className="underline">
                        {t(
                            'dailyBrief.settings.openToday',
                            'Ouvrir Aujourd’hui'
                        )}
                    </Link>
                </p>
                {WEEKDAYS.map((day) => {
                    const key = String(day);
                    const window = draft.capacity.evening[key];
                    const setWindow = (patch: Partial<BriefEveningWindow>) => {
                        const base: BriefEveningWindow = window ?? {
                            start: '19:00',
                            end: '21:00',
                            minutes: 60,
                        };
                        update({
                            capacity: {
                                ...draft.capacity,
                                evening: {
                                    ...draft.capacity.evening,
                                    [key]: { ...base, ...patch },
                                },
                            },
                        });
                    };
                    return (
                        <div
                            key={day}
                            data-testid={`brief-evening-${day}`}
                            className="grid grid-cols-2 gap-2 rounded-lg bg-white p-2 text-sm sm:grid-cols-5 dark:bg-gray-900/60"
                        >
                            <span className="self-center font-medium">
                                {weekdayLabel(day, locale)}
                            </span>
                            <label className="flex flex-col gap-1 text-xs">
                                {t('dailyBrief.settings.eveningStart', 'Début')}
                                <input
                                    type="time"
                                    step={300}
                                    value={window?.start ?? ''}
                                    onChange={(event) =>
                                        setWindow({ start: event.target.value })
                                    }
                                    className={FORM.input}
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs">
                                {t('dailyBrief.settings.eveningEnd', 'Fin')}
                                <input
                                    type="time"
                                    step={300}
                                    value={window?.end ?? ''}
                                    onChange={(event) =>
                                        setWindow({ end: event.target.value })
                                    }
                                    className={FORM.input}
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs">
                                {t(
                                    'dailyBrief.settings.eveningMinutes',
                                    'Minutes'
                                )}
                                <input
                                    type="number"
                                    min={0}
                                    max={600}
                                    step={5}
                                    value={window?.minutes ?? ''}
                                    onChange={(event) =>
                                        setWindow({
                                            minutes: Number(event.target.value),
                                        })
                                    }
                                    className={FORM.input}
                                />
                            </label>
                            {window && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const evening = {
                                            ...draft.capacity.evening,
                                        };
                                        delete evening[key];
                                        update({
                                            capacity: {
                                                ...draft.capacity,
                                                evening,
                                            },
                                        });
                                    }}
                                    className="h-9 self-end rounded-lg px-2 text-xs text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                    {t(
                                        'dailyBrief.settings.eveningRemove',
                                        'Retirer'
                                    )}
                                </button>
                            )}
                            <label className="flex flex-col gap-1 text-xs">
                                {t(
                                    'dailyBrief.settings.dayNote',
                                    'Note du jour'
                                )}
                                <input
                                    type="text"
                                    maxLength={120}
                                    value={draft.capacity.dayNotes[key] ?? ''}
                                    onChange={(event) =>
                                        update({
                                            capacity: {
                                                ...draft.capacity,
                                                dayNotes: {
                                                    ...draft.capacity.dayNotes,
                                                    [key]: event.target.value,
                                                },
                                            },
                                        })
                                    }
                                    className={FORM.input}
                                />
                            </label>
                        </div>
                    );
                })}
            </Card>

            <Card title={t('dailyBrief.settings.arbitrage', 'Arbitrage')}>
                <p className="text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.priorities', 'Ordre de priorité')}
                </p>
                <ul className="space-y-1">
                    {draft.priorities.map((id, index) => (
                        <li
                            key={id}
                            className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 dark:bg-gray-900/60"
                        >
                            <span className="flex-1 text-sm">
                                {priorityLabel(id)}
                            </span>
                            <button
                                type="button"
                                aria-label={t(
                                    'dailyBrief.settings.moveUp',
                                    'Monter {{name}}',
                                    { name: priorityLabel(id) }
                                )}
                                disabled={index === 0}
                                onClick={() =>
                                    update({
                                        priorities: move(
                                            draft.priorities,
                                            index,
                                            -1
                                        ),
                                    })
                                }
                                className="h-8 rounded-md px-2 text-sm disabled:opacity-30"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                aria-label={t(
                                    'dailyBrief.settings.moveDown',
                                    'Descendre {{name}}',
                                    { name: priorityLabel(id) }
                                )}
                                disabled={index === draft.priorities.length - 1}
                                onClick={() =>
                                    update({
                                        priorities: move(
                                            draft.priorities,
                                            index,
                                            1
                                        ),
                                    })
                                }
                                className="h-8 rounded-md px-2 text-sm disabled:opacity-30"
                            >
                                ↓
                            </button>
                        </li>
                    ))}
                </ul>
                {(
                    [
                        [
                            'postponements',
                            'dailyBrief.settings.postponements',
                            1,
                            20,
                            1,
                        ],
                        ['maxMoves', 'dailyBrief.settings.maxMoves', 0, 10, 1],
                        [
                            'maxTonight',
                            'dailyBrief.settings.maxTonight',
                            0,
                            10,
                            1,
                        ],
                        [
                            'closedLookbackDays',
                            'dailyBrief.settings.closedLookback',
                            1,
                            60,
                            1,
                        ],
                    ] as const
                ).map(([key, label, min, max, step]) => (
                    <label
                        key={key}
                        className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200"
                    >
                        {t(label, key)}
                        <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={draft.thresholds[key]}
                            onChange={(event) =>
                                update({
                                    thresholds: {
                                        ...draft.thresholds,
                                        [key]: Number(event.target.value),
                                    },
                                })
                            }
                            className={`${FORM.input} w-24`}
                        />
                    </label>
                ))}
            </Card>

            <Card title={t('dailyBrief.settings.alerts', 'Alertes')}>
                {ALERT_IDS.map((id) => (
                    <Check
                        key={id}
                        label={alertLabel(id)}
                        checked={!draft.alerts.disabled.includes(id)}
                        onChange={(on) =>
                            update({
                                alerts: {
                                    ...draft.alerts,
                                    disabled: toggleList(
                                        draft.alerts.disabled,
                                        id,
                                        !on
                                    ),
                                },
                            })
                        }
                    />
                ))}
            </Card>

            <Card title={t('dailyBrief.settings.writing', 'Rédaction')}>
                <Check
                    label={t(
                        'dailyBrief.settings.llmEnabled',
                        'Réécrire le verdict avec l’IA'
                    )}
                    checked={draft.llm.enabled}
                    onChange={(enabled) => update({ llm: { enabled } })}
                />
                <p className="text-xs text-gray-600 dark:text-gray-300">
                    <Link
                        to="/profile?section=ai-assistant"
                        className="underline"
                    >
                        {t(
                            'dailyBrief.settings.llmProvider',
                            'Fournisseur IA : Profil › Assistant IA'
                        )}
                    </Link>
                </p>
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.tone', 'Ton')}
                    <input
                        type="text"
                        maxLength={40}
                        value={draft.writing.tone}
                        onChange={(event) =>
                            update({
                                writing: {
                                    ...draft.writing,
                                    tone: event.target.value,
                                },
                            })
                        }
                        className={FORM.input}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.signature', 'Signature')}
                    <input
                        type="text"
                        maxLength={200}
                        value={draft.writing.signature}
                        onChange={(event) =>
                            update({
                                writing: {
                                    ...draft.writing,
                                    signature: event.target.value,
                                },
                            })
                        }
                        className={FORM.input}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.instructions', 'Consignes')}
                    <textarea
                        maxLength={2000}
                        rows={3}
                        value={draft.writing.instructions}
                        onChange={(event) =>
                            update({
                                writing: {
                                    ...draft.writing,
                                    instructions: event.target.value,
                                },
                            })
                        }
                        className={FORM.input}
                    />
                </label>
            </Card>

            <Card title={t('dailyBrief.settings.retention', 'Conservation')}>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t(
                        'dailyBrief.settings.decisionsDays',
                        'Décisions gardées (jours)'
                    )}
                    <input
                        type="number"
                        min={1}
                        max={365}
                        value={draft.retention.decisionsDays}
                        onChange={(event) =>
                            update({
                                retention: {
                                    ...draft.retention,
                                    decisionsDays: Number(event.target.value),
                                },
                            })
                        }
                        className={`${FORM.input} w-24`}
                    />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.audioDays', 'Audio gardé (jours)')}
                    <input
                        type="number"
                        min={1}
                        max={90}
                        value={draft.retention.audioDays}
                        onChange={(event) =>
                            update({
                                retention: {
                                    ...draft.retention,
                                    audioDays: Number(event.target.value),
                                },
                            })
                        }
                        className={`${FORM.input} w-24`}
                    />
                </label>
            </Card>

            <Card title={t('dailyBrief.settings.voice', 'Voix')}>
                <Check
                    label={t(
                        'dailyBrief.settings.voiceEnabled',
                        'Lire le résumé à voix haute'
                    )}
                    checked={draft.voice.enabled}
                    onChange={(enabled) =>
                        update({ voice: { ...draft.voice, enabled } })
                    }
                />
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.piperUrl', 'Adresse Piper')}
                    <input
                        type="url"
                        value={draft.voice.piperUrl}
                        onChange={(event) =>
                            update({
                                voice: {
                                    ...draft.voice,
                                    piperUrl: event.target.value,
                                },
                            })
                        }
                        className={FORM.input}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.voiceName', 'Voix')}
                    <input
                        type="text"
                        maxLength={100}
                        value={draft.voice.voice}
                        onChange={(event) =>
                            update({
                                voice: {
                                    ...draft.voice,
                                    voice: event.target.value,
                                },
                            })
                        }
                        className={FORM.input}
                    />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
                    {t('dailyBrief.settings.speed', 'Vitesse')}
                    <input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={draft.voice.speed}
                        onChange={(event) =>
                            update({
                                voice: {
                                    ...draft.voice,
                                    speed: Number(event.target.value),
                                },
                            })
                        }
                        className={`${FORM.input} w-24`}
                    />
                </label>
            </Card>

            <Card title={t('dailyBrief.settings.options', 'Options')}>
                {(
                    [
                        [
                            'eveningWrapUp',
                            'dailyBrief.settings.optEvening',
                            'Bilan du soir',
                        ],
                        [
                            'telegram',
                            'dailyBrief.settings.optTelegram',
                            'Envoyer sur Telegram',
                        ],
                        [
                            'sonos',
                            'dailyBrief.settings.optSonos',
                            'Lire sur Sonos',
                        ],
                        [
                            'weekly',
                            'dailyBrief.settings.optWeekly',
                            'Résumé hebdomadaire',
                        ],
                    ] as const
                ).map(([key, label, fallback]) => (
                    <Check
                        key={key}
                        label={t(label, fallback)}
                        checked={draft.options[key]}
                        onChange={(on) =>
                            update({ options: { ...draft.options, [key]: on } })
                        }
                    />
                ))}
            </Card>

            {saveError && (
                <p
                    role="alert"
                    className="mb-3 text-sm text-red-600 dark:text-red-400"
                >
                    {saveError}
                </p>
            )}
            <div className="flex items-center justify-end gap-3">
                {savedNotice && (
                    <span
                        role="status"
                        className="text-sm text-gray-600 dark:text-gray-300"
                    >
                        {t('dailyBrief.settings.saved', 'Réglages enregistrés')}
                    </span>
                )}
                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="h-10 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {t('dailyBrief.settings.save', 'Enregistrer')}
                </button>
            </div>
        </div>
    );
};

export default DailyBriefTab;

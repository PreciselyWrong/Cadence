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
    fetchTriageSettings,
    saveTriageSettings,
    TriageSettings,
    TRIAGE_ALERT_TYPES,
} from '../../../utils/triageService';

interface TriageTabProps {
    isActive: boolean;
}

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({
    title,
    children,
}) => (
    <section className="mb-6 rounded-xl bg-gray-50 p-5 dark:bg-gray-800/60">
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

const NumberField: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, onChange }) => (
    <label className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200">
        {label}
        <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className={`${FORM.input} w-24`}
        />
    </label>
);

const toggleList = (list: string[], id: string, on: boolean) =>
    on
        ? [...list.filter((item) => item !== id), id]
        : list.filter((item) => item !== id);

// What feeds the "À trier" queue (docs/40-triage.md, Settings): the calendars
// read for conflicts, the rules, and the assistant's proposals.
const TriageTab: React.FC<TriageTabProps> = ({ isActive }) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<TriageSettings | null>(null);
    const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
    const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>(
        []
    );
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedNotice, setSavedNotice] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isActive || draft) return;
        Promise.all([
            fetchTriageSettings(),
            fetchCalendarFeeds().catch(() => []),
            fetchGoogleStatus().catch(() => null),
        ])
            .then(([settings, calendarFeeds, google]) => {
                setDraft(settings);
                setFeeds(calendarFeeds);
                setGoogleCalendars(google?.calendars ?? []);
            })
            .catch((error: Error) =>
                setLoadError(
                    error?.message ||
                        t(
                            'triage.settings.loadError',
                            'Impossible de charger les réglages.'
                        )
                )
            );
    }, [isActive, draft, t]);

    if (!draft) {
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

    const update = (patch: Partial<TriageSettings>) => {
        setSavedNotice(false);
        setDraft({ ...draft, ...patch });
    };

    const save = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            setDraft(await saveTriageSettings(draft));
            setSavedNotice(true);
        } catch (error) {
            setSaveError(
                (error as Error).message ||
                    t(
                        'triage.settings.saveError',
                        'Impossible d’enregistrer les réglages.'
                    )
            );
        } finally {
            setSaving(false);
        }
    };

    const calendarOptions = [
        ...feeds.map((feed) => ({ uid: feed.uid, name: feed.name })),
        ...googleCalendars.map((calendar) => ({
            uid: calendar.feed_uid,
            name: calendar.name,
        })),
    ];

    return (
        <div className={isActive ? '' : 'hidden'} data-testid="triage-tab">
            <h3 className="mb-5 text-lg font-semibold text-gray-900 dark:text-white">
                {t('triage.title', 'À trier')}
            </h3>

            <Card title={t('triage.settings.calendars', 'Calendriers lus')}>
                {calendarOptions.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            'triage.settings.noCalendars',
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
                <NumberField
                    label={t('triage.settings.lookahead', 'Jours à regarder')}
                    value={draft.calendarLookaheadDays}
                    min={1}
                    max={14}
                    onChange={(calendarLookaheadDays) =>
                        update({ calendarLookaheadDays })
                    }
                />
            </Card>

            <Card title={t('triage.settings.alerts', 'Alertes')}>
                {TRIAGE_ALERT_TYPES.map((id) => (
                    <Check
                        key={id}
                        label={t(`triage.settings.alertType.${id}`, id)}
                        checked={!draft.alerts.disabled.includes(id)}
                        onChange={(on) =>
                            update({
                                alerts: {
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
                <NumberField
                    label={t(
                        'triage.settings.postponements',
                        'Reports avant une carte'
                    )}
                    value={draft.thresholds.postponements}
                    min={1}
                    max={20}
                    onChange={(postponements) =>
                        update({
                            thresholds: { ...draft.thresholds, postponements },
                        })
                    }
                />
                <NumberField
                    label={t(
                        'triage.settings.closedLookback',
                        'Tâches terminées regardées (jours)'
                    )}
                    value={draft.thresholds.closedLookbackDays}
                    min={1}
                    max={60}
                    onChange={(closedLookbackDays) =>
                        update({
                            thresholds: {
                                ...draft.thresholds,
                                closedLookbackDays,
                            },
                        })
                    }
                />
            </Card>

            <Card title={t('triage.settings.assistant', 'Assistant IA')}>
                <Check
                    label={t(
                        'triage.settings.assistantEnabled',
                        'Propositions de l’IA dans À trier'
                    )}
                    checked={draft.triage.enabled}
                    onChange={(enabled) =>
                        update({ triage: { ...draft.triage, enabled } })
                    }
                />
                {draft.triage.enabled && (
                    <NumberField
                        label={t(
                            'triage.settings.assistantLimit',
                            'Tâches regardées par jour'
                        )}
                        value={draft.triage.dailyLimit}
                        min={1}
                        max={200}
                        onChange={(dailyLimit) =>
                            update({ triage: { ...draft.triage, dailyLimit } })
                        }
                    />
                )}
                <p className="text-xs text-gray-600 dark:text-gray-300">
                    <Link
                        to="/profile?section=ai-assistant"
                        className="underline"
                    >
                        {t(
                            'triage.settings.llmProvider',
                            'Fournisseur IA : Profil › Assistant IA'
                        )}
                    </Link>
                </p>
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
                        {t('triage.settings.saved', 'Réglages enregistrés')}
                    </span>
                )}
                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="h-10 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {t('triage.settings.save', 'Enregistrer')}
                </button>
            </div>
        </div>
    );
};

export default TriageTab;

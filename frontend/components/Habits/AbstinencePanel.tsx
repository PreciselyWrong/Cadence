import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CadenceEntry,
    CadenceHabitDetail,
    createRow,
} from '../../utils/cadenceHabitsService';
import { abstinenceDays, formatDate } from '../../utils/cadenceHabitUtils';
import { sidePanelInputClass } from '../SidePanel/SidePanelParts';

interface AbstinencePanelProps {
    habit: CadenceHabitDetail;
    today: string;
    // Slips noted over the last 90 days
    entries: CadenceEntry[];
    onChanged: () => void;
}

const SPAN = 90;
const field = `${sidePanelInputClass} min-h-[44px] border border-outline/50`;

// The days clear of an abstinence, what was noted (check-ins and urges), and a
// way to note more. No savings, no health claims: it only counts what is noted.
const AbstinencePanel: React.FC<AbstinencePanelProps> = ({
    habit,
    today,
    entries,
    onChanged,
}) => {
    const { t, i18n } = useTranslation();
    const language = i18n?.language ?? 'en';
    const [kind, setKind] = useState<'CHECK_IN' | 'URGE'>('CHECK_IN');
    const [intensity, setIntensity] = useState('3');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const days = useMemo(
        () =>
            abstinenceDays({
                startsOn: habit.starts_on,
                today,
                span: SPAN,
                entries,
                pauses: habit.pauses,
            }),
        [habit.starts_on, habit.pauses, today, entries]
    );
    const observed = days.filter((d) => d.status !== 'UNOBSERVED');
    const slips = observed.filter((d) =>
        d.status.endsWith('OCCURRENCE')
    ).length;
    const clear = observed.filter((d) => d.status.endsWith('CLEAR')).length;
    const streak = habit.status.streak ?? { current: 0, best: 0 };
    const logs = [...habit.abstinence_logs]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .slice(0, 8);

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            setNote('');
            onChanged();
        } catch (caught) {
            setError(
                t(
                    'cadenceHabits.errors.saveEntry',
                    'Could not save the entry ({{code}}).',
                    {
                        code:
                            caught instanceof Error
                                ? caught.message
                                : String(caught),
                    }
                )
            );
        } finally {
            setBusy(false);
        }
    };

    const tone: Record<string, string> = {
        CLEAR: 'bg-success',
        TODAY_CLEAR: 'bg-success',
        OCCURRENCE: 'bg-danger',
        TODAY_OCCURRENCE: 'bg-danger',
        PAUSED: 'bg-outline',
        UNOBSERVED: 'bg-surface-variant',
    };

    return (
        <section
            aria-labelledby="abstinence-title"
            className="rounded-card bg-surface-card p-4"
        >
            <h2
                id="abstinence-title"
                className="mb-3 text-title-m text-surface-on"
            >
                {t('cadenceHabits.abstinence.title', 'Days clear')}
            </h2>
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    [
                        t('cadenceHabits.abstinence.current', 'Current run'),
                        t('cadenceHabits.abstinence.days', '{{count}} days', {
                            count: streak.current,
                        }),
                    ],
                    [
                        t('cadenceHabits.abstinence.best', 'Best run'),
                        t('cadenceHabits.abstinence.days', '{{count}} days', {
                            count: streak.best,
                        }),
                    ],
                    [
                        t(
                            'cadenceHabits.abstinence.clear90',
                            'Clear days (90)'
                        ),
                        String(clear),
                    ],
                    [
                        t(
                            'cadenceHabits.abstinence.slips90',
                            'Slips noted (90)'
                        ),
                        String(slips),
                    ],
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-label-m text-surface-on-variant">
                            {label}
                        </dt>
                        <dd className="text-title text-surface-on">{value}</dd>
                    </div>
                ))}
            </dl>
            <div
                role="img"
                aria-label={t(
                    'cadenceHabits.abstinence.stripLabel',
                    'Last {{span}} days: {{clear}} clear, {{slips}} with a slip noted',
                    { span: SPAN, clear, slips }
                )}
                className="mb-2 flex flex-wrap gap-[3px]"
            >
                {days.map((day) => (
                    <span
                        key={day.date}
                        title={`${formatDate(day.date, language)}`}
                        className={`h-3 w-3 rounded-[3px] ${tone[day.status]}`}
                    />
                ))}
            </div>
            <p className="mb-4 text-label-m text-surface-on-variant">
                {t(
                    'cadenceHabits.abstinence.assumption',
                    'This count depends on what you note. Paused days are left out and stop the run. These figures do not measure your health.'
                )}
            </p>

            <form
                className="space-y-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    run(() =>
                        createRow(habit.uid, 'abstinence-logs', {
                            kind,
                            intensity:
                                kind === 'URGE' ? Number(intensity) : null,
                            note: note.trim() || null,
                        })
                    );
                }}
            >
                <div
                    role="radiogroup"
                    aria-label={t(
                        'cadenceHabits.abstinence.logKind',
                        'What to note'
                    )}
                    className="flex flex-wrap gap-2"
                >
                    {(['CHECK_IN', 'URGE'] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={kind === value}
                            onClick={() => setKind(value)}
                            className={`min-h-[44px] rounded-full px-4 text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                kind === value
                                    ? 'bg-primary text-primary-on'
                                    : 'border border-outline/35 bg-surface-variant/60 text-surface-on'
                            }`}
                        >
                            {value === 'CHECK_IN'
                                ? t(
                                      'cadenceHabits.abstinence.checkIn',
                                      'Check-in'
                                  )
                                : t('cadenceHabits.abstinence.urge', 'Urge')}
                        </button>
                    ))}
                </div>
                {kind === 'URGE' && (
                    <div>
                        <label
                            htmlFor="urge-intensity"
                            className="mb-1 block text-sm font-medium text-surface-on"
                        >
                            {t(
                                'cadenceHabits.abstinence.intensity',
                                'Intensity (1 to 5)'
                            )}
                        </label>
                        <select
                            id="urge-intensity"
                            value={intensity}
                            onChange={(event) =>
                                setIntensity(event.target.value)
                            }
                            className={field}
                        >
                            {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <div>
                    <label
                        htmlFor="abstinence-note"
                        className="mb-1 block text-sm font-medium text-surface-on"
                    >
                        {t('cadenceHabits.entry.note', 'Note')}
                    </label>
                    <input
                        id="abstinence-note"
                        type="text"
                        maxLength={500}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className={field}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="submit"
                        disabled={busy}
                        className="min-h-[44px] rounded-full bg-primary px-5 text-label text-primary-on focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                        {t('cadenceHabits.abstinence.note', 'Note it')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            run(() =>
                                createRow(habit.uid, 'entries', {
                                    value_minor: 1,
                                    note: null,
                                })
                            )
                        }
                        className="min-h-[44px] rounded-full border border-outline/35 bg-surface-variant/60 px-5 text-label text-surface-on focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                        {t(
                            'cadenceHabits.abstinence.recordToday',
                            'Note a slip today'
                        )}
                    </button>
                </div>
                {error && (
                    <p role="alert" className="text-sm text-danger">
                        {error}
                    </p>
                )}
            </form>

            {logs.length > 0 && (
                <ul className="mt-4 divide-y divide-outline-variant">
                    {logs.map((log) => (
                        <li
                            key={log.uid}
                            className="flex flex-wrap gap-x-3 py-2 text-body-m"
                        >
                            <span className="text-surface-on-variant">
                                {formatDate(log.local_date, language)}
                            </span>
                            <span className="text-surface-on">
                                {log.kind === 'URGE'
                                    ? t(
                                          'cadenceHabits.abstinence.urgeLine',
                                          'Urge, intensity {{n}}',
                                          { n: log.intensity ?? '' }
                                      )
                                    : t(
                                          'cadenceHabits.abstinence.checkIn',
                                          'Check-in'
                                      )}
                            </span>
                            {log.note && (
                                <span className="text-surface-on-variant">
                                    {log.note}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default AbstinencePanel;

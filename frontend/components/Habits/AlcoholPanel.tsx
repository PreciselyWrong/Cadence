import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlcoholConsumption,
    CadenceHabitDetail,
    createRow,
    updateRow,
} from '../../utils/cadenceHabitsService';
import { formatDate } from '../../utils/cadenceHabitUtils';
import { sidePanelInputClass } from '../SidePanel/SidePanelParts';

interface AlcoholPanelProps {
    habit: CadenceHabitDetail;
    today: string;
    timezone: string;
    onChanged: () => void;
}

const field = `${sidePanelInputClass} min-h-[44px] border border-outline/50`;

// The standard drinks noted per day for an alcohol abstinence. One row per
// date: noting a date again corrects it.
const AlcoholPanel: React.FC<AlcoholPanelProps> = ({
    habit,
    today,
    timezone,
    onChanged,
}) => {
    const { t, i18n } = useTranslation();
    const language = i18n?.language ?? 'en';
    const [date, setDate] = useState(today);
    const [drinks, setDrinks] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rows = [...habit.alcohol_consumptions]
        .sort((a, b) => b.local_date.localeCompare(a.local_date))
        .slice(0, 14);

    const edit = (row: AlcoholConsumption) => {
        setDate(row.local_date);
        setDrinks(row.standard_drinks ? String(row.standard_drinks) : '');
    };

    const submit = async () => {
        const count = drinks.trim() ? Number(drinks) : null;
        if (count !== null && (!Number.isInteger(count) || count <= 0)) {
            setError(
                t(
                    'cadenceHabits.alcohol.invalid',
                    'Standard drinks must be a whole number above zero.'
                )
            );
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const existing = habit.alcohol_consumptions.find(
                (row) => row.local_date === date
            );
            if (existing) {
                await updateRow(
                    habit.uid,
                    'alcohol-consumptions',
                    existing.uid,
                    {
                        standard_drinks: count,
                    }
                );
            } else {
                await createRow(habit.uid, 'alcohol-consumptions', {
                    local_date: date,
                    observed_zone_id: timezone,
                    standard_drinks: count,
                });
            }
            setDrinks('');
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

    return (
        <section
            aria-labelledby="alcohol-title"
            className="rounded-card bg-surface-card p-4"
        >
            <h2
                id="alcohol-title"
                className="mb-3 text-title-m text-surface-on"
            >
                {t('cadenceHabits.alcohol.title', 'Standard drinks')}
            </h2>
            <form
                className="mb-4 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <div>
                    <label
                        htmlFor="alcohol-date"
                        className="mb-1 block text-sm font-medium text-surface-on"
                    >
                        {t('cadenceHabits.entry.date', 'Date')}
                    </label>
                    <input
                        id="alcohol-date"
                        type="date"
                        max={today}
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className={field}
                    />
                </div>
                <div>
                    <label
                        htmlFor="alcohol-drinks"
                        className="mb-1 block text-sm font-medium text-surface-on"
                    >
                        {t('cadenceHabits.alcohol.drinks', 'Standard drinks')}
                    </label>
                    <input
                        id="alcohol-drinks"
                        type="text"
                        inputMode="numeric"
                        value={drinks}
                        onChange={(event) => setDrinks(event.target.value)}
                        className={field}
                    />
                </div>
                <button
                    type="submit"
                    disabled={busy || !date}
                    className="min-h-[44px] rounded-full bg-primary px-5 text-label text-primary-on focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                >
                    {t('cadenceHabits.alcohol.save', 'Note it')}
                </button>
            </form>
            {error && (
                <p role="alert" className="mb-3 text-sm text-danger">
                    {error}
                </p>
            )}
            {rows.length === 0 ? (
                <p className="text-body-m text-surface-on-variant">
                    {t('cadenceHabits.alcohol.none', 'No consumption noted.')}
                </p>
            ) : (
                <ul className="divide-y divide-outline-variant">
                    {rows.map((row) => (
                        <li
                            key={row.uid}
                            className="flex min-h-[44px] items-center justify-between gap-3 py-1"
                        >
                            <span className="text-body-m text-surface-on">
                                {formatDate(row.local_date, language)}
                                {' · '}
                                {row.standard_drinks
                                    ? t(
                                          'cadenceHabits.alcohol.count',
                                          '{{count}} drinks',
                                          { count: row.standard_drinks }
                                      )
                                    : t(
                                          'cadenceHabits.alcohol.toSpecify',
                                          'to specify'
                                      )}
                            </span>
                            <button
                                type="button"
                                onClick={() => edit(row)}
                                aria-label={t(
                                    'cadenceHabits.alcohol.editFor',
                                    'Edit {{date}}',
                                    {
                                        date: formatDate(
                                            row.local_date,
                                            language
                                        ),
                                    }
                                )}
                                className="min-h-[44px] rounded-md px-3 text-sm text-primary hover:bg-surface-variant/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                {t('common.edit', 'Edit')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default AlcoholPanel;

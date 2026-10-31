import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    CadenceGoal,
    CadenceQuickValue,
} from '../../utils/cadenceHabitsService';
import {
    formatWithUnit,
    toMinor,
    unitOfGoal,
} from '../../utils/cadenceHabitUtils';

interface HabitQuickEntryProps {
    id: string;
    goal: CadenceGoal;
    quickValues: CadenceQuickValue[];
    onLog: (amountMinor: number, note?: string) => Promise<void>;
}

// The amounts a habit offers with one tap, and a free amount with a note.
const HabitQuickEntry: React.FC<HabitQuickEntryProps> = ({
    id,
    goal,
    quickValues,
    onLog,
}) => {
    const { t } = useTranslation();
    const [custom, setCustom] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const scale = unitOfGoal(goal)?.scale ?? 1;
    const symbol = unitOfGoal(goal)?.symbol;
    const amount = toMinor(custom, scale);

    const log = async (value: number, withNote?: string) => {
        setBusy(true);
        try {
            await onLog(value, withNote?.trim() || undefined);
            setCustom('');
            setNote('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            id={id}
            className="space-y-3 border-t border-current/15 px-4 pb-4 pt-3"
        >
            {quickValues.length > 0 && (
                <ul
                    className="flex flex-wrap gap-2"
                    aria-label={t(
                        'cadenceHabits.quick.values',
                        'Quick amounts'
                    )}
                >
                    {quickValues.map((quick) => (
                        <li key={quick.uid}>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => log(quick.amount_minor)}
                                className="inline-flex min-h-[44px] items-center rounded-full bg-black/20 px-4 text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 disabled:opacity-60"
                            >
                                +{formatWithUnit(quick.amount_minor, goal)}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (amount) log(amount, note);
                }}
            >
                <div className="flex min-w-[8rem] flex-1 flex-col gap-1 text-label-m">
                    <label htmlFor={`${id}-amount`}>
                        {t('cadenceHabits.quick.other', 'Other amount')}
                    </label>
                    <span className="flex items-center gap-2">
                        <input
                            id={`${id}-amount`}
                            type="text"
                            inputMode="decimal"
                            value={custom}
                            onChange={(event) => setCustom(event.target.value)}
                            className="min-h-[44px] w-full rounded-control bg-white/90 px-3 text-body-m text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                        />
                        {symbol && <span aria-hidden="true">{symbol}</span>}
                    </span>
                </div>
                <label className="flex min-w-[8rem] flex-[2] flex-col gap-1 text-label-m">
                    {t('cadenceHabits.quick.note', 'Note (optional)')}
                    <input
                        type="text"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="min-h-[44px] w-full rounded-control bg-white/90 px-3 text-body-m text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                    />
                </label>
                <button
                    type="submit"
                    disabled={!amount || busy}
                    className="inline-flex min-h-[44px] items-center rounded-full bg-black/25 px-5 text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 disabled:opacity-50"
                >
                    {t('cadenceHabits.quick.add', 'Add')}
                </button>
            </form>
        </div>
    );
};

export default HabitQuickEntry;

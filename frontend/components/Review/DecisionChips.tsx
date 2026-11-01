import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface DecisionOption {
    key: string;
    label: string;
    run: () => void;
    // Asks for a date before running.
    date?: (day: string) => void;
}

interface DecisionChipsProps {
    // The first options show as one-tap chips; the rest sit behind "More…".
    options: DecisionOption[];
    disabled?: boolean;
    // Shows each chip's keyboard number (one item at a time).
    numbered?: boolean;
}

const SHOWN = 3;

const chipClass =
    'rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800';

// The choices of a row as one-tap chips: nothing to open for the common ones.
const DecisionChips: React.FC<DecisionChipsProps> = ({
    options,
    disabled,
    numbered,
}) => {
    const { t } = useTranslation();
    const [more, setMore] = useState(false);
    const [askingDate, setAskingDate] = useState<DecisionOption | null>(null);

    if (askingDate) {
        return (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <label className="flex items-center gap-2">
                    {askingDate.label}
                    <input
                        type="date"
                        autoFocus
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        onChange={(e) => {
                            if (!e.target.value) return;
                            const chosen = askingDate;
                            setAskingDate(null);
                            chosen.date?.(e.target.value);
                        }}
                    />
                </label>
                <button
                    type="button"
                    className={chipClass}
                    onClick={() => setAskingDate(null)}
                >
                    {t('review.cancelDate', 'Cancel')}
                </button>
            </div>
        );
    }

    const shown = more ? options : options.slice(0, SHOWN);

    return (
        <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t('review.choices', 'Choices')}
        >
            {shown.map((option, index) => (
                <button
                    key={option.key}
                    type="button"
                    disabled={disabled}
                    className={chipClass}
                    onClick={() =>
                        option.date ? setAskingDate(option) : option.run()
                    }
                >
                    {numbered && index < 9 && !option.date && (
                        <span
                            aria-hidden="true"
                            className="mr-1.5 text-gray-400 dark:text-gray-500"
                        >
                            {index + 1}
                        </span>
                    )}
                    {option.label}
                </button>
            ))}
            {!more && options.length > SHOWN && (
                <button
                    type="button"
                    className={chipClass}
                    aria-expanded={more}
                    onClick={() => setMore(true)}
                >
                    {t('review.more', 'More…')}
                </button>
            )}
        </div>
    );
};

export default DecisionChips;

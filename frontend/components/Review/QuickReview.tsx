import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DecisionChips, { DecisionOption } from './DecisionChips';
import { useDecisionKeys } from './useDecisionKeys';
import Button from '../Shared/ui/Button';

// The agent's choice for the current item (docs/47-proposals.md): preselected,
// with its reason; one tap validates it, the other choices stay.
export interface Suggestion {
    // The option's label, as the chips show it.
    choice: string;
    reason: string | null;
    run: () => void;
}

interface QuickReviewProps {
    loading: boolean;
    // What the current item is about: "Pushed back", "Later"…
    kind: string | null;
    // The current item's title, meta and link card; null when done.
    card: React.ReactNode | null;
    // Resets "More…" when the next item comes.
    itemKey: string | null;
    options: DecisionOption[];
    suggestion?: Suggestion | null;
    position: number;
    total: number;
    onSkip: () => void;
    onStop: () => void;
    onOpen: () => void;
    onAgain: () => void;
}

// The quick review: one thing at a time, one decision, then the next. The
// progress is the session's own ("3 of 10"), never the size of the backlog.
const QuickReview: React.FC<QuickReviewProps> = ({
    loading,
    kind,
    card,
    itemKey,
    options,
    suggestion = null,
    position,
    total,
    onSkip,
    onStop,
    onOpen,
    onAgain,
}) => {
    const { t } = useTranslation();
    const active = !loading && card !== null;
    useDecisionKeys({
        options: active ? options : [],
        onSkip: active ? onSkip : undefined,
        onOpen: active ? onOpen : undefined,
        onStop,
    });
    // Enter validates the suggestion, unless a control has the focus (it keeps
    // its own Enter) or a field is being typed in.
    useEffect(() => {
        if (!active || !suggestion) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || event.altKey || event.ctrlKey) return;
            if (event.metaKey || event.shiftKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest?.('button, a, input, textarea, select')) return;
            event.preventDefault();
            suggestion.run();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, suggestion]);

    const header = (
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {t('review.quick.title', 'Quick review')}
            </h3>
            <button
                type="button"
                onClick={onStop}
                className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
            >
                {t('review.quick.stop', 'Stop')}
            </button>
        </div>
    );

    if (loading) {
        return (
            <section className="space-y-4">
                {header}
                <p className="py-10 text-center text-sm text-gray-600 dark:text-gray-300">
                    {t('review.loading', 'Loading…')}
                </p>
            </section>
        );
    }

    if (!card) {
        return (
            <section className="space-y-4">
                {header}
                <div className="space-y-2 py-10 text-center">
                    <p className="text-base text-gray-900 dark:text-gray-100">
                        {total === 0
                            ? t(
                                  'review.quick.nothing',
                                  'Nothing needs a look right now.'
                              )
                            : t('review.quick.done', "That's it for now.")}
                    </p>
                    {total > 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {t(
                                'review.quick.saved',
                                'Every decision is saved. What you skipped comes back next time.'
                            )}
                        </p>
                    )}
                    <div className="flex justify-center gap-4 pt-3">
                        {total > 0 && (
                            <button
                                type="button"
                                onClick={onAgain}
                                className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                            >
                                {t('review.quick.again', 'Another round')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onStop}
                            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                            {t('review.quick.back', 'Back to the review')}
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="space-y-4" aria-live="polite">
            {header}
            <div className="flex items-center gap-3">
                <div
                    className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                    aria-hidden="true"
                >
                    <div
                        className="h-full rounded-full bg-blue-400/70 transition-[width] duration-300 ease-out"
                        style={{
                            width: `${Math.round(((position - 1) / Math.max(total, 1)) * 100)}%`,
                        }}
                    />
                </div>
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {t('review.quick.position', '{{position}} of {{total}}', {
                        position,
                        total,
                    })}
                </span>
            </div>
            <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                {kind && (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {kind}
                    </span>
                )}
                {card}
            </div>
            {suggestion && (
                <div className="space-y-3 rounded-lg bg-primary-container/40 p-3">
                    {suggestion.reason && (
                        <p className="text-sm text-surface-on">
                            {suggestion.reason}
                        </p>
                    )}
                    <Button variant="primary" onClick={suggestion.run}>
                        {t(
                            'proposals.review.validate',
                            'Valider : {{choice}}',
                            { choice: suggestion.choice }
                        )}
                    </Button>
                </div>
            )}
            <DecisionChips key={itemKey ?? ''} options={options} numbered />
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={onSkip}
                    className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                >
                    {t('review.later.skip', 'Skip')}
                </button>
                <span className="hidden text-xs text-gray-400 dark:text-gray-500 sm:block">
                    {t(
                        'review.quick.keys',
                        '1–9 choose · S skip · O open · Esc stop'
                    )}
                </span>
            </div>
        </section>
    );
};

export default QuickReview;

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Placement } from './autoPlace';
import { formatDuration, formatMinute } from './planUtils';

interface PlaceAllDialogProps {
    placements: Placement[];
    names: Record<string, string>;
    onApply: () => void;
    onCancel: () => void;
}

// Preview of "Place all": nothing changes until Apply, and the page then
// offers Undo.
const PlaceAllDialog: React.FC<PlaceAllDialogProps> = ({
    placements,
    names,
    onApply,
    onCancel,
}) => {
    const { t } = useTranslation();
    const placed = placements
        .filter((p) => p.start !== null)
        .sort((a, b) => (a.start as number) - (b.start as number));
    const unplaced = placements.filter((p) => p.start === null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="place-all-title"
                data-testid="place-all-dialog"
                className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-gray-900"
            >
                <h3
                    id="place-all-title"
                    className="text-lg text-gray-900 dark:text-gray-100"
                >
                    {t('dailyPlan.placeAllTitle', 'Place tasks in free time')}
                </h3>
                {placed.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t(
                            'dailyPlan.placeAllNothing',
                            'No free slot is left today.'
                        )}
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t(
                                'dailyPlan.placeAllHint',
                                '{{count}} tasks go into the next free slots, in priority order.',
                                { count: placed.length }
                            )}
                        </p>
                        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                            {placed.map((p) => (
                                <li
                                    key={p.uid}
                                    className="flex items-baseline gap-3 py-1.5 text-sm"
                                >
                                    <span className="w-[6.5rem] shrink-0 tabular-nums text-gray-600 dark:text-gray-400">
                                        {formatMinute(p.start as number)} –{' '}
                                        {formatMinute(
                                            (p.start as number) + p.duration
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">
                                        {names[p.uid]}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {formatDuration(p.duration)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {unplaced.length > 0 && (
                    <p
                        className="text-sm text-amber-800 dark:text-amber-300"
                        data-testid="place-all-unplaced"
                    >
                        {t(
                            'dailyPlan.placeAllUnplaced',
                            'No room today for {{count}} more: they stay in the list.',
                            { count: unplaced.length }
                        )}
                    </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-h-[40px] rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onApply}
                        disabled={placed.length === 0}
                        className="min-h-[40px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        data-testid="place-all-apply"
                        autoFocus
                    >
                        {t('dailyPlan.placeAllApply', 'Apply')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlaceAllDialog;

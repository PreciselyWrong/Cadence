import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { FocusBlock, saveFocusBlocks } from '../../utils/dailyPlanService';
import { useToast } from '../Shared/ToastContext';
import { formatMinute, intlLocale } from './planUtils';

interface FocusBlocksDialogProps {
    blocks: FocusBlock[];
    language: string;
    onSaved: (blocks: FocusBlock[]) => void;
    onClose: () => void;
}

// Monday first; the numbers are JS weekdays (0 is Sunday), as stored.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STEP_MINUTES = 30;

const toMinute = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

const newBlock = (): FocusBlock => ({
    id: '',
    days: [1, 2, 3, 4, 5],
    start: 9 * 60,
    end: 11 * 60,
});

const inputClass =
    'min-h-[36px] rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

// Recurring focus time: days and hours that "Place all" and the + button
// never fill with tasks. Saved as one list.
const FocusBlocksDialog: React.FC<FocusBlocksDialogProps> = ({
    blocks,
    language,
    onSaved,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [draft, setDraft] = useState<FocusBlock[]>(blocks);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const dayName = (day: number) =>
        new Intl.DateTimeFormat(intlLocale(language), {
            weekday: 'short',
        }).format(new Date(2023, 0, 1 + day));

    const change = (index: number, changes: Partial<FocusBlock>) =>
        setDraft((current) =>
            current.map((block, i) =>
                i === index ? { ...block, ...changes } : block
            )
        );

    const invalid = draft.some(
        (block) => block.days.length === 0 || block.end <= block.start
    );

    const save = async () => {
        setSaving(true);
        try {
            const saved = await saveFocusBlocks(draft);
            onSaved(saved);
            onClose();
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t(
                          'dailyPlan.focusSaveError',
                          'Could not save your focus time.'
                      )
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="focus-blocks-title"
                data-testid="focus-blocks-dialog"
                className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-gray-900"
            >
                <div>
                    <h3
                        id="focus-blocks-title"
                        className="text-lg text-gray-900 dark:text-gray-100"
                    >
                        {t('dailyPlan.focusTitle', 'Focus time')}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t(
                            'dailyPlan.focusHint',
                            'Hours kept free of tasks: Place all and the + button skip them.'
                        )}
                    </p>
                </div>

                {draft.length === 0 && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {t('dailyPlan.focusNone', 'No focus time set.')}
                    </p>
                )}

                {draft.map((block, index) => (
                    <fieldset
                        key={block.id || `new-${index}`}
                        className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                        data-testid="focus-block"
                    >
                        <legend className="sr-only">
                            {t('dailyPlan.focusBlock', 'Focus block')}{' '}
                            {index + 1}
                        </legend>
                        <div className="flex flex-wrap gap-1.5">
                            {WEEK_ORDER.map((day) => {
                                const on = block.days.includes(day);
                                return (
                                    <button
                                        key={day}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() =>
                                            change(index, {
                                                days: on
                                                    ? block.days.filter(
                                                          (d) => d !== day
                                                      )
                                                    : [...block.days, day].sort(
                                                          (a, b) => a - b
                                                      ),
                                            })
                                        }
                                        className={`min-h-[34px] rounded-lg px-2.5 text-xs font-medium ${
                                            on
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                        }`}
                                    >
                                        {dayName(day)}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                type="time"
                                step={STEP_MINUTES * 60}
                                value={formatMinute(block.start)}
                                onChange={(e) =>
                                    e.target.value &&
                                    change(index, {
                                        start: toMinute(e.target.value),
                                    })
                                }
                                aria-label={t('dailyPlan.focusFrom', 'From')}
                                className={inputClass}
                            />
                            <span aria-hidden="true">–</span>
                            <input
                                type="time"
                                step={STEP_MINUTES * 60}
                                value={formatMinute(block.end)}
                                onChange={(e) =>
                                    e.target.value &&
                                    change(index, {
                                        end: toMinute(e.target.value),
                                    })
                                }
                                aria-label={t('dailyPlan.focusTo', 'To')}
                                className={inputClass}
                            />
                            <input
                                type="text"
                                maxLength={60}
                                value={block.label ?? ''}
                                onChange={(e) =>
                                    change(index, { label: e.target.value })
                                }
                                placeholder={t(
                                    'dailyPlan.focusLabel',
                                    'Label (optional)'
                                )}
                                aria-label={t(
                                    'dailyPlan.focusLabel',
                                    'Label (optional)'
                                )}
                                className={`${inputClass} min-w-0 flex-1`}
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setDraft((current) =>
                                        current.filter((_, i) => i !== index)
                                    )
                                }
                                aria-label={t('common.delete', 'Delete')}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </fieldset>
                ))}

                <button
                    type="button"
                    onClick={() =>
                        setDraft((current) => [...current, newBlock()])
                    }
                    className="inline-flex min-h-[36px] items-center gap-1.5 self-start rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20"
                    data-testid="focus-add"
                >
                    <PlusIcon className="h-4 w-4" />
                    {t('dailyPlan.focusAdd', 'Add focus time')}
                </button>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[40px] rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || invalid}
                        className="min-h-[40px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        data-testid="focus-save"
                    >
                        {t('common.save', 'Save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FocusBlocksDialog;

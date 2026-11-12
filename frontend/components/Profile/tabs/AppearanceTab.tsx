import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    SunIcon,
    MoonIcon,
    ComputerDesktopIcon,
    SwatchIcon,
    ArrowDownIcon,
    ArrowUpIcon,
    Bars3BottomLeftIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import {
    useShowTaskDescription,
    writeShowTaskDescription,
} from '../../../utils/taskRowDisplay';
import {
    ACCENT_PRESETS,
    applyAppearance,
    getStoredAccent,
    getStoredPureBlack,
    storeAccent,
    storePureBlack,
} from '../../../utils/appearance';
import type { ProfileFormData } from '../types';
import type { UiDensity } from '../../../store/useStore';
import {
    DEFAULT_TASK_ROW_FIELDS,
    TaskRowField,
    TaskRowFieldKey,
    normalizeTaskRowFields,
} from '../../../constants/taskRowFields';

interface AppearanceTabProps {
    isActive: boolean;
    formData: ProfileFormData;
    onAppearanceChange: (appearance: 'light' | 'dark' | 'system') => void;
    density: UiDensity;
    onDensityChange: (density: UiDensity) => void;
    taskRowFields?: TaskRowField[] | null;
    onTaskRowFieldsChange?: (fields: TaskRowField[]) => void;
}

const TASK_ROW_FIELD_LABELS: Record<
    TaskRowFieldKey,
    { key: string; fallback: string }
> = {
    recurrence: {
        key: 'profile.taskRowFields.recurrence',
        fallback: 'Recurring',
    },
    comments: { key: 'profile.taskRowFields.comments', fallback: 'Comments' },
    tags: { key: 'profile.taskRowFields.tags', fallback: 'Tags' },
    project: { key: 'profile.taskRowFields.project', fallback: 'Project' },
    priority: {
        key: 'profile.taskRowFields.priority',
        fallback: 'Priority flag',
    },
    due: { key: 'profile.taskRowFields.due', fallback: 'Due date' },
};

const AppearanceTab: React.FC<AppearanceTabProps> = ({
    isActive,
    formData,
    onAppearanceChange,
    density,
    onDensityChange,
    taskRowFields,
    onTaskRowFieldsChange,
}) => {
    const { t } = useTranslation();
    const [accent, setAccent] = useState(getStoredAccent);
    const [pureBlack, setPureBlack] = useState(getStoredPureBlack);
    const showTaskDescription = useShowTaskDescription();
    const [customHex, setCustomHex] = useState(accent);

    if (!isActive) return null;

    const rowFields = normalizeTaskRowFields(
        taskRowFields ?? DEFAULT_TASK_ROW_FIELDS
    );
    const moveRowField = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= rowFields.length) return;
        const next = [...rowFields];
        [next[index], next[target]] = [next[target], next[index]];
        onTaskRowFieldsChange?.(next);
    };
    const toggleRowField = (index: number, visible: boolean) => {
        onTaskRowFieldsChange?.(
            rowFields.map((field, i) =>
                i === index ? { ...field, visible } : field
            )
        );
    };

    const chooseAccent = (hex: string) => {
        setAccent(hex);
        setCustomHex(hex);
        storeAccent(hex);
        applyAppearance(hex, pureBlack);
    };

    const togglePureBlack = () => {
        const next = !pureBlack;
        setPureBlack(next);
        storePureBlack(next);
        applyAppearance(accent, next);
    };

    return (
        <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
                <SwatchIcon className="w-6 h-6 mr-3 text-blue-500" />
                {t('profile.appearance', 'Appearance')}
            </h3>

            {/* Theme */}
            <div className="mb-8">
                <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-4">
                    {t('profile.theme', 'Theme')}
                </h4>
                <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => onAppearanceChange('light')}
                        className={`flex items-center justify-center px-5 py-2 text-sm font-medium transition-colors ${
                            formData.appearance === 'light'
                                ? 'bg-primary text-primary-on'
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                        <SunIcon className="h-4 w-4 mr-2" />
                        {t('profile.lightMode', 'Light')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onAppearanceChange('dark')}
                        className={`flex items-center justify-center px-5 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600 transition-colors ${
                            formData.appearance === 'dark'
                                ? 'bg-primary text-primary-on'
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                        <MoonIcon className="h-4 w-4 mr-2" />
                        {t('profile.darkMode', 'Dark')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onAppearanceChange('system')}
                        className={`flex items-center justify-center px-5 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600 transition-colors ${
                            formData.appearance === 'system'
                                ? 'bg-primary text-primary-on'
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                        <ComputerDesktopIcon className="h-4 w-4 mr-2" />
                        {t('profile.systemMode', 'System')}
                    </button>
                </div>
            </div>

            {/* Accent colour and pure black, same choices as the Android app */}
            <div className="mb-8">
                <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-4">
                    {t('profile.accent', 'Accent colour')}
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                    {ACCENT_PRESETS.map((preset) => {
                        const selected =
                            accent.toUpperCase() === preset.hex.toUpperCase();
                        const label = t(preset.labelKey, preset.fallback);
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                aria-label={label}
                                aria-pressed={selected}
                                title={label}
                                onClick={() => chooseAccent(preset.hex)}
                                className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95 ${
                                    selected
                                        ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white ring-offset-white dark:ring-offset-gray-900'
                                        : ''
                                }`}
                                style={{ backgroundColor: preset.hex }}
                            >
                                {selected && (
                                    <CheckCircleIcon className="h-5 w-5 text-white" />
                                )}
                            </button>
                        );
                    })}
                    <input
                        type="text"
                        value={customHex}
                        maxLength={7}
                        aria-label={t('profile.accentCustom', 'Custom colour')}
                        placeholder="#5E5CE6"
                        onChange={(e) => {
                            setCustomHex(e.target.value);
                            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                                chooseAccent(e.target.value.toUpperCase());
                            }
                        }}
                        className="h-10 w-28 rounded-control border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-600"
                    />
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <input
                        type="checkbox"
                        role="switch"
                        checked={pureBlack}
                        onChange={togglePureBlack}
                        className="h-4 w-4 rounded"
                    />
                    {t('profile.pureBlack', 'Pure black in dark mode')}
                </label>
            </div>

            {/* Interface density */}
            <div className="mb-8">
                <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-4">
                    {t('profile.interfaceDensity', 'Interface')}
                </h4>
                <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                    {(
                        [
                            ['minimal', t('profile.densityMinimal', 'Minimal')],
                            ['dense', t('profile.densityDense', 'Dense')],
                        ] as const
                    ).map(([value, label], index) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={density === value}
                            onClick={() => onDensityChange(value)}
                            className={`flex items-center justify-center px-5 py-2 text-sm font-medium transition-colors ${
                                index > 0
                                    ? 'border-l border-gray-300 dark:border-gray-600'
                                    : ''
                            } ${
                                density === value
                                    ? 'bg-primary text-primary-on'
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <input
                        type="checkbox"
                        role="switch"
                        checked={showTaskDescription}
                        onChange={() =>
                            writeShowTaskDescription(!showTaskDescription)
                        }
                        className="h-4 w-4 rounded"
                    />
                    {t(
                        'profile.showTaskDescription',
                        'Show the description under the title'
                    )}
                </label>
                <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                    {t(
                        'profile.densityDescription',
                        'Minimal hides extras for a calm list; Dense shows every control.'
                    )}
                </p>
            </div>

            {/* Task row details: only for the minimal list rows */}
            {density === 'minimal' && (
                <div className="mb-8">
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Bars3BottomLeftIcon className="w-4 h-4" />
                        {t('profile.taskRowDetails', 'Task row details')}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                        {t(
                            'profile.taskRowDetailsDescription',
                            'Choose which details show on the right of a minimal task row, and in what order.'
                        )}
                    </p>
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700">
                        {rowFields.map((field, index) => {
                            const label = TASK_ROW_FIELD_LABELS[field.key];
                            const name = t(label.key, label.fallback);
                            return (
                                <li
                                    key={field.key}
                                    className="flex items-center gap-3 px-3 py-2"
                                >
                                    <label className="flex flex-1 items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                                        <input
                                            type="checkbox"
                                            checked={field.visible}
                                            onChange={(e) =>
                                                toggleRowField(
                                                    index,
                                                    e.target.checked
                                                )
                                            }
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {name}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => moveRowField(index, -1)}
                                        disabled={index === 0}
                                        aria-label={`${t('profile.taskRowMoveUp', 'Move up')}: ${name}`}
                                        title={t(
                                            'profile.taskRowMoveUp',
                                            'Move up'
                                        )}
                                        className="p-1 rounded text-gray-600 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                                    >
                                        <ArrowUpIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => moveRowField(index, 1)}
                                        disabled={
                                            index === rowFields.length - 1
                                        }
                                        aria-label={`${t('profile.taskRowMoveDown', 'Move down')}: ${name}`}
                                        title={t(
                                            'profile.taskRowMoveDown',
                                            'Move down'
                                        )}
                                        className="p-1 rounded text-gray-600 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                                    >
                                        <ArrowDownIcon className="h-4 w-4" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default AppearanceTab;

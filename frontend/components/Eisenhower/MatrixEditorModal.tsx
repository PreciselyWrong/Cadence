import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Project } from '../../entities/Project';
import {
    EisenhowerMatrixConfig,
    MatrixDueType,
    MatrixPriority,
    MatrixRule,
} from '../../utils/profileService';

interface MatrixEditorModalProps {
    matrix: EisenhowerMatrixConfig;
    projects: Project[];
    onSave: (matrix: EisenhowerMatrixConfig) => void;
    onCancel: () => void;
}

const PRIORITIES: MatrixPriority[] = ['none', 'low', 'medium', 'high'];
const DUE_TYPES: MatrixDueType[] = [
    'any',
    'overdue',
    'today',
    'within',
    'none',
];

const inputClass =
    'w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100';

const MatrixEditorModal: React.FC<MatrixEditorModalProps> = ({
    matrix,
    projects,
    onSave,
    onCancel,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(matrix.name);
    const [quadrants, setQuadrants] = useState(matrix.quadrants);
    const [tagText, setTagText] = useState(
        matrix.quadrants.map((q) => q.rule.tags.join(', '))
    );

    const updateRule = (index: number, patch: Partial<MatrixRule>) => {
        setQuadrants((prev) =>
            prev.map((q, i) =>
                i === index ? { ...q, rule: { ...q.rule, ...patch } } : q
            )
        );
    };

    const toggle = <T,>(list: T[], value: T): T[] =>
        list.includes(value)
            ? list.filter((v) => v !== value)
            : [...list, value];

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
            ...matrix,
            name: name.trim(),
            quadrants: quadrants.map((q, i) => ({
                name: q.name.trim() || `Q${i + 1}`,
                rule: {
                    ...q.rule,
                    tags: tagText[i]
                        .split(',')
                        .map((tag) => tag.trim().toLowerCase())
                        .filter(Boolean),
                },
            })),
        });
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
            onClick={onCancel}
        >
            <form
                role="dialog"
                aria-label={t(
                    'tasks.eisenhower.matrix.editTitle',
                    'Edit matrix'
                )}
                onSubmit={handleSave}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto"
            >
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    {t('tasks.eisenhower.matrix.editTitle', 'Edit matrix')}
                </h3>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('tasks.eisenhower.matrix.name', 'Matrix name')}
                    <input
                        className={`${inputClass} mt-1`}
                        value={name}
                        maxLength={60}
                        required
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    {quadrants.map((q, i) => (
                        <fieldset
                            key={i}
                            className="border border-gray-200 dark:border-gray-700 rounded p-3 space-y-2"
                        >
                            <legend className="text-xs font-semibold text-gray-600 dark:text-gray-300 px-1">
                                {t('tasks.eisenhower.matrix.quadrant', {
                                    defaultValue: 'Quadrant {{number}}',
                                    number: i + 1,
                                })}
                            </legend>
                            <input
                                aria-label={t(
                                    'tasks.eisenhower.matrix.quadrantName',
                                    'Quadrant name'
                                )}
                                className={inputClass}
                                value={q.name}
                                maxLength={60}
                                onChange={(e) =>
                                    setQuadrants((prev) =>
                                        prev.map((x, j) =>
                                            j === i
                                                ? { ...x, name: e.target.value }
                                                : x
                                        )
                                    )
                                }
                            />
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                                {t(
                                    'tasks.eisenhower.matrix.priorities',
                                    'Priority (any of)'
                                )}
                                <div className="flex flex-wrap gap-3 mt-1">
                                    {PRIORITIES.map((p) => (
                                        <label
                                            key={p}
                                            className="flex items-center gap-1"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={q.rule.priorities.includes(
                                                    p
                                                )}
                                                onChange={() =>
                                                    updateRule(i, {
                                                        priorities: toggle(
                                                            q.rule.priorities,
                                                            p
                                                        ),
                                                    })
                                                }
                                            />
                                            {t(
                                                `tasks.eisenhower.matrix.priority.${p}`,
                                                p
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <label className="block text-xs text-gray-600 dark:text-gray-300">
                                {t('tasks.eisenhower.matrix.due', 'Due date')}
                                <div className="flex gap-2 mt-1">
                                    <select
                                        className={inputClass}
                                        value={q.rule.due.type}
                                        onChange={(e) => {
                                            const type = e.target
                                                .value as MatrixDueType;
                                            updateRule(i, {
                                                due:
                                                    type === 'within'
                                                        ? {
                                                              type,
                                                              days:
                                                                  q.rule.due
                                                                      .days ??
                                                                  7,
                                                          }
                                                        : { type },
                                            });
                                        }}
                                    >
                                        {DUE_TYPES.map((d) => (
                                            <option key={d} value={d}>
                                                {t(
                                                    `tasks.eisenhower.matrix.dueType.${d}`,
                                                    d
                                                )}
                                            </option>
                                        ))}
                                    </select>
                                    {q.rule.due.type === 'within' && (
                                        <input
                                            type="number"
                                            min={1}
                                            max={365}
                                            aria-label={t(
                                                'tasks.eisenhower.matrix.days',
                                                'Days'
                                            )}
                                            className={`${inputClass} w-20`}
                                            value={q.rule.due.days ?? 7}
                                            onChange={(e) =>
                                                updateRule(i, {
                                                    due: {
                                                        type: 'within',
                                                        days: Math.min(
                                                            365,
                                                            Math.max(
                                                                1,
                                                                Number(
                                                                    e.target
                                                                        .value
                                                                ) || 1
                                                            )
                                                        ),
                                                    },
                                                })
                                            }
                                        />
                                    )}
                                </div>
                            </label>
                            <label className="block text-xs text-gray-600 dark:text-gray-300">
                                {t(
                                    'tasks.eisenhower.matrix.tags',
                                    'Tags (any of, comma separated)'
                                )}
                                <input
                                    className={`${inputClass} mt-1`}
                                    value={tagText[i]}
                                    onChange={(e) =>
                                        setTagText((prev) =>
                                            prev.map((x, j) =>
                                                j === i ? e.target.value : x
                                            )
                                        )
                                    }
                                />
                            </label>
                            {projects.length > 0 && (
                                <div className="text-xs text-gray-600 dark:text-gray-300">
                                    {t(
                                        'tasks.eisenhower.matrix.projects',
                                        'Projects (optional)'
                                    )}
                                    <div className="max-h-24 overflow-y-auto mt-1 space-y-0.5">
                                        {projects
                                            .filter((p) => p.uid)
                                            .map((p) => (
                                                <label
                                                    key={p.uid}
                                                    className="flex items-center gap-1"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={q.rule.projects.includes(
                                                            p.uid!
                                                        )}
                                                        onChange={() =>
                                                            updateRule(i, {
                                                                projects:
                                                                    toggle(
                                                                        q.rule
                                                                            .projects,
                                                                        p.uid!
                                                                    ),
                                                            })
                                                        }
                                                    />
                                                    {p.name}
                                                </label>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </fieldset>
                    ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 italic">
                    {t(
                        'tasks.eisenhower.matrix.firstMatchHint',
                        'Each task appears in the first quadrant whose rule it matches. Empty choices match everything.'
                    )}
                </p>
                <div className="flex justify-end gap-3 mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-sm bg-primary text-primary-on rounded hover:bg-primary/90"
                    >
                        {t('common.save', 'Save')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default MatrixEditorModal;

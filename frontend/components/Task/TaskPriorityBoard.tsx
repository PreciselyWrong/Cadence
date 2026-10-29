import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';

export type BoardPriority = 'high' | 'medium' | 'low' | null;

interface TaskPriorityBoardProps {
    tasks: Task[];
    // Called when a card is dropped in another column; the parent saves it.
    onChangePriority: (task: Task, priority: BoardPriority) => void;
    onOpenTask: (task: Task) => void;
}

type ColumnKey = 'high' | 'medium' | 'low' | 'none';

const COLUMNS: { key: ColumnKey; value: BoardPriority }[] = [
    { key: 'high', value: 'high' },
    { key: 'medium', value: 'medium' },
    { key: 'low', value: 'low' },
    { key: 'none', value: null },
];

const PRIORITY_NAMES: BoardPriority[] = ['low', 'medium', 'high'];

// Tasks store priority as a name or, from older data, as an index.
export const boardPriorityOf = (task: Task): BoardPriority => {
    const value = task.priority;
    if (typeof value === 'number') return PRIORITY_NAMES[value] ?? null;
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    return null;
};

const LABELS: Record<ColumnKey, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    none: 'None',
};

// Columns by priority. A card dropped in another column changes its priority.
const TaskPriorityBoard: React.FC<TaskPriorityBoardProps> = ({
    tasks,
    onChangePriority,
    onOpenTask,
}) => {
    const { t } = useTranslation();
    const [dragOver, setDragOver] = useState<ColumnKey | null>(null);

    const byColumn = useMemo(() => {
        const groups: Record<ColumnKey, Task[]> = {
            high: [],
            medium: [],
            low: [],
            none: [],
        };
        tasks.forEach((task) => {
            groups[boardPriorityOf(task) ?? 'none'].push(task);
        });
        return groups;
    }, [tasks]);

    const labelOf = (key: ColumnKey) => t(`priority.${key}`, LABELS[key]);

    const drop = (column: (typeof COLUMNS)[number], uid: string) => {
        setDragOver(null);
        const task = tasks.find((item) => item.uid === uid);
        if (!task) return;
        if (boardPriorityOf(task) === column.value) return;
        onChangePriority(task, column.value);
    };

    return (
        <div
            data-testid="task-priority-board"
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
            {COLUMNS.map((column) => (
                <section
                    key={column.key}
                    data-testid={`priority-column-${column.key}`}
                    aria-label={labelOf(column.key)}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOver(column.key);
                    }}
                    onDragLeave={() =>
                        setDragOver((current) =>
                            current === column.key ? null : current
                        )
                    }
                    onDrop={(e) => {
                        e.preventDefault();
                        drop(column, e.dataTransfer.getData('text/plain'));
                    }}
                    className={`min-w-0 rounded-lg border p-2 ${
                        dragOver === column.key
                            ? 'border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-900/20'
                            : 'border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/30'
                    }`}
                >
                    <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <span>{labelOf(column.key)}</span>
                        <span>{byColumn[column.key].length}</span>
                    </h3>
                    <ul className="space-y-2">
                        {byColumn[column.key].map((task) => (
                            <li
                                key={task.uid}
                                data-testid={`board-card-${task.uid}`}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData(
                                        'text/plain',
                                        task.uid ?? ''
                                    );
                                }}
                                className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                            >
                                <button
                                    type="button"
                                    onClick={() => onOpenTask(task)}
                                    className="block w-full text-left text-sm text-gray-900 hover:underline dark:text-gray-100"
                                >
                                    {task.name}
                                </button>
                                {task.due_date && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        {String(task.due_date).slice(0, 10)}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};

export default TaskPriorityBoard;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { taskSource, TaskSourceKind } from '../../utils/taskSource';
import TodoMdBadge from './TodoMdBadge';

// A letter mark per origin. Plain letters on a flat colour, never a logo.
const MARKS: Record<
    Exclude<TaskSourceKind, 'todo_md'>,
    { letter: string; className: string }
> = {
    gmail: { letter: 'M', className: 'bg-[#EA4335]' },
    telegram: { letter: 'T', className: 'bg-[#229ED9]' },
    mcp: { letter: 'C', className: 'bg-gray-500' },
    android: { letter: 'A', className: 'bg-emerald-600' },
    desktop: { letter: 'D', className: 'bg-slate-500' },
    link: { letter: 'L', className: 'bg-gray-500' },
};

// Shows where a task came from. With a web address the badge opens it in a
// new tab; the click does not also open the task row.
const TaskSourceBadge: React.FC<{ task: Task; className?: string }> = ({
    task,
    className = '',
}) => {
    const { t } = useTranslation();
    const source = taskSource(task);
    if (!source) return null;
    if (source.kind === 'todo_md') return <TodoMdBadge />;

    const mark = MARKS[source.kind];
    const classes = `inline-flex h-5 max-w-[10rem] flex-shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${className}`;
    const content = (
        <>
            <span
                aria-hidden="true"
                className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold leading-none text-white ${mark.className}`}
            >
                {mark.letter}
            </span>
            <span className="truncate text-[11px] font-medium">
                {t(`taskSource.${source.kind}`, source.label)}
            </span>
        </>
    );

    if (source.url) {
        return (
            <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className={`${classes} hover:bg-gray-200 dark:hover:bg-gray-700`}
                title={t('taskSource.openSource', 'Open the source')}
                data-testid="task-source-badge"
            >
                {content}
            </a>
        );
    }

    return (
        <span
            className={classes}
            title={t('taskSource.fromSource', 'Came from {{source}}', {
                source: source.label,
            })}
            data-testid="task-source-badge"
        >
            {content}
        </span>
    );
};

export default TaskSourceBadge;

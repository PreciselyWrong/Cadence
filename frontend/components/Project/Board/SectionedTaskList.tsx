import React, { useMemo, useState } from 'react';
import { TFunction } from 'i18next';
import { Task } from '../../../entities/Task';
import { groupTasksBySourceSection } from './boardModel';

// Past this many cards a section folds: a column stays scannable.
const SECTION_CAP = 8;

interface SectionedTaskListProps {
    tasks: Task[];
    renderTask: (task: Task) => React.ReactNode;
    t: TFunction;
}

// The cards of one sub-project column, under the sections of its TODO.md
// (Now, Next, Ideas…), each folded past SECTION_CAP cards.
const SectionedTaskList: React.FC<SectionedTaskListProps> = ({
    tasks,
    renderTask,
    t,
}) => {
    const groups = useMemo(() => groupTasksBySourceSection(tasks), [tasks]);
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const showHeaders = groups.some((group) => group.label);

    return (
        <>
            {groups.map((group) => {
                const open = expanded.has(group.key);
                const shown = open
                    ? group.tasks
                    : group.tasks.slice(0, SECTION_CAP);
                const hidden = group.tasks.length - shown.length;
                return (
                    <section
                        key={group.key}
                        className="space-y-1.5"
                        data-testid={`board-section-${group.key || 'none'}`}
                    >
                        {showHeaders && (
                            <h4 className="sticky top-0 z-10 flex items-center gap-1.5 bg-gray-50 px-0.5 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                                {group.label ||
                                    t('projectBoard.otherTasks', 'Other')}
                                <span className="font-medium tabular-nums text-gray-400 dark:text-gray-500">
                                    {group.tasks.length}
                                </span>
                            </h4>
                        )}
                        {shown.map(renderTask)}
                        {(hidden > 0 || open) &&
                            group.tasks.length > SECTION_CAP && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpanded((prev) => {
                                            const next = new Set(prev);
                                            if (open) next.delete(group.key);
                                            else next.add(group.key);
                                            return next;
                                        })
                                    }
                                    aria-expanded={open}
                                    className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-blue-600 hover:bg-gray-200/70 dark:text-blue-400 dark:hover:bg-gray-800"
                                >
                                    {open
                                        ? t(
                                              'projectBoard.showLess',
                                              'Show less'
                                          )
                                        : t(
                                              'projectBoard.showMore',
                                              'Show {{count}} more',
                                              { count: hidden }
                                          )}
                                </button>
                            )}
                    </section>
                );
            })}
        </>
    );
};

export default SectionedTaskList;

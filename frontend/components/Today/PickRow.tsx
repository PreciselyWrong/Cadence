import React from 'react';
import { parseISO } from 'date-fns';
import { Task } from '../../entities/Task';
import Button from '../Shared/ui/Button';
import Chip from '../Shared/task/TaskChip';

const MAX_TAGS = 2;

export interface PickRowProps {
    task: Task;
    locale: string;
    onOpen(uid: string): void;
    // Null shows the label as plain text instead of a button.
    action: (() => void) | null;
    label: string;
}

// A task to pick for the day (late, tomorrow, suggestions): the name, then
// where it lives (project, tags) so the row reads without opening it.
const PickRow: React.FC<PickRowProps> = ({
    task,
    locale,
    onOpen,
    action,
    label,
}) => {
    const tags = (task.tags ?? []).slice(0, MAX_TAGS);
    return (
        <div className="flex min-h-[36px] items-center gap-3 rounded-lg px-3 hover:bg-surface-high max-sm:min-h-[44px]">
            <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-body-m text-surface-on"
                onClick={() => task.uid && onOpen(task.uid)}
            >
                {task.name}
            </button>
            {(task.Project?.name || tags.length > 0) && (
                <span className="flex min-w-0 max-w-[40%] shrink items-center gap-1 overflow-hidden">
                    {task.Project?.name && (
                        <Chip>
                            <span className="truncate">
                                {task.Project.name}
                            </span>
                        </Chip>
                    )}
                    {tags.map((tag) => (
                        <Chip key={tag.name}>
                            <span className="truncate">#{tag.name}</span>
                        </Chip>
                    ))}
                </span>
            )}
            {task.due_date && (
                <span className="text-xs tabular-nums text-surface-on-variant">
                    {new Intl.DateTimeFormat(locale, {
                        day: 'numeric',
                        month: 'short',
                    }).format(parseISO(task.due_date.slice(0, 10)))}
                </span>
            )}
            {action ? (
                <Button size="sm" variant="ghost" onClick={action}>
                    {label}
                </Button>
            ) : (
                <span className="text-xs text-surface-on-variant">{label}</span>
            )}
        </div>
    );
};

export default PickRow;

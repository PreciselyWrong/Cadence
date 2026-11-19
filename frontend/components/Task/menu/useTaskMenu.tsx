import React, { useCallback, useState } from 'react';
import { Task } from '../../../entities/Task';
import TaskContextMenu, { TaskContextMenuProps } from './TaskContextMenu';

type Overrides = Omit<TaskContextMenuProps, 'task' | 'x' | 'y' | 'onClose'>;

/**
 * The task menu for a list that has no row component of its own: spread
 * `bind(task)` on the row and render `node` once in the list.
 */
export const useTaskMenu = (overrides?: (task: Task) => Overrides) => {
    const [at, setAt] = useState<{ task: Task; x: number; y: number } | null>(
        null
    );
    const close = useCallback(() => setAt(null), []);

    const bind = (task: Task) => ({
        'data-task-uid': task.uid,
        onContextMenu: (event: React.MouseEvent) => {
            if (!task.uid) return;
            event.preventDefault();
            event.stopPropagation();
            setAt({ task, x: event.clientX, y: event.clientY });
        },
    });

    const node = at ? (
        <TaskContextMenu
            {...overrides?.(at.task)}
            task={at.task}
            x={at.x}
            y={at.y}
            onClose={close}
        />
    ) : null;

    return { bind, node, openUid: at?.task.uid ?? null };
};

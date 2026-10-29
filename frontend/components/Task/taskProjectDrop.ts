import { Task } from '../../entities/Task';
import { updateTask } from '../../utils/tasksService';
import { TASK_UPDATED_EVENT } from '../../contexts/TaskPaneContext';

// A Minimal sidebar project row carries its uid here, so a dragged task row
// can find the project under the pointer.
export const PROJECT_DROP_ATTR = 'data-project-drop-uid';

// The sidebar listens for this to highlight the project under a drag. The
// detail is the project uid, or null when the drag leaves the projects.
export const TASK_DRAG_HOVER_EVENT = 'tududi:task-drag-hover';

export interface DragPoint {
    x: number;
    y: number;
}

// Where the pointer is during a list drag: the point the drag started from
// (the activator event) plus dnd-kit's movement since then. Keyboard drags
// have no pointer, so they give null.
export const dragPointer = (
    activatorEvent: unknown,
    delta: DragPoint
): DragPoint | null => {
    if (!activatorEvent || typeof activatorEvent !== 'object') return null;
    const event = activatorEvent as {
        clientX?: unknown;
        clientY?: unknown;
        touches?: ArrayLike<{ clientX: number; clientY: number }>;
    };
    const point = event.touches?.[0] ?? event;
    if (
        typeof point.clientX !== 'number' ||
        typeof point.clientY !== 'number'
    ) {
        return null;
    }
    return { x: point.clientX + delta.x, y: point.clientY + delta.y };
};

// The uid of the sidebar project under a point, if any.
export const projectUidAt = (point: DragPoint | null): string | null => {
    if (!point || typeof document.elementFromPoint !== 'function') return null;
    const element = document.elementFromPoint(point.x, point.y);
    return (
        element
            ?.closest(`[${PROJECT_DROP_ATTR}]`)
            ?.getAttribute(PROJECT_DROP_ATTR) ?? null
    );
};

export const announceProjectHover = (projectUid: string | null): void => {
    window.dispatchEvent(
        new CustomEvent<string | null>(TASK_DRAG_HOVER_EVENT, {
            detail: projectUid,
        })
    );
};

// Moves a dropped task to a project, then announces the saved task so the
// lists show the change, as the task pane does.
export const moveTaskToProject = async (
    task: Task,
    projectUid: string
): Promise<Task> => {
    const updated = await updateTask(task.uid as string, {
        project_uid: projectUid,
    });
    window.dispatchEvent(
        new CustomEvent<Task>(TASK_UPDATED_EVENT, { detail: updated })
    );
    return updated;
};

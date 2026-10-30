// Window events that let a task row ask the command center to act, without
// the row depending on the palette or the toast provider.
export const OPEN_PALETTE_EVENT = 'cadence:open-palette';
export const DELETE_TASK_EVENT = 'cadence:delete-task';

export interface OpenPaletteDetail {
    taskUid?: string;
    step?: 'project';
}

export interface DeleteTaskDetail {
    uid: string;
    name: string;
}

export const requestMoveToProject = (taskUid: string): void => {
    window.dispatchEvent(
        new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, {
            detail: { taskUid, step: 'project' },
        })
    );
};

export const requestDeleteTask = (uid: string, name: string): void => {
    window.dispatchEvent(
        new CustomEvent<DeleteTaskDetail>(DELETE_TASK_EVENT, {
            detail: { uid, name },
        })
    );
};

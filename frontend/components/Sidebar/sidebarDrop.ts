import React, { createContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { Note } from '../../entities/Note';
import { Project } from '../../entities/Project';
import { fetchTaskByUid, updateTask } from '../../utils/tasksService';
import { fetchNoteBySlug, updateNote } from '../../utils/notesService';
import { fetchProjects, updateProject } from '../../utils/projectsService';
// datePresets, not dateUtils: dateUtils loads i18n, which every list
// importing this module would then pull in.
import { toYmd } from '../../utils/datePresets';
import { TASK_UPDATED_EVENT } from '../../contexts/TaskPaneContext';
import { useStore } from '../../store/useStore';
import { swallowNextClick } from '../Shared/sortableList';
import { useToast } from '../Shared/ToastContext';

// Dropping a task, note or project on a sidebar row: the row says what it
// is (project, tag, area, Today/Tomorrow) and this module decides whether it
// takes the item and saves the change.
//
// Two ways in, one set of targets:
// - Lists that already sort with dnd-kit (TaskList, Upcoming groups, Today
//   candidates, Projects page) look up the row under the pointer when their
//   drag ends (useSidebarDrop().dragEnd). dnd-kit moves the row with pointer
//   events, so the sidebar never sees a drop event of its own.
// - Lists without dnd-kit (plain task lists, note cards, sidebar rows) use
//   native HTML5 drag (nativeDragSourceProps). During that drag, listeners on
//   the document find the row under the pointer the same way, so target rows
//   need nothing but their data attribute. A native draggable is never put
//   on an element dnd-kit drags (SortableItem turns NativeTaskDragContext
//   off), or the two would fight over the same press.
// Keyboard drags have no pointer, so they never reach the sidebar.

export type DragItem =
    | { kind: 'task'; task: Task }
    | { kind: 'note'; note: Note }
    | { kind: 'project'; project: Project };

export type DropTargetKind = 'project' | 'tag' | 'area' | 'day';

export interface DropTarget {
    kind: DropTargetKind;
    // The project, tag or area uid; 'today' or 'tomorrow' for a day.
    uid: string;
}

export interface DragPoint {
    x: number;
    y: number;
}

export const DROP_TARGET_ATTR = 'data-sidebar-drop';

// The sidebar listens for this to highlight the target under a drag. The
// detail is the target key (`project:<uid>`), or null once nothing is under
// the pointer.
export const SIDEBAR_DRAG_HOVER_EVENT = 'cadence:sidebar-drag-hover';

const DRAG_ITEM_TYPE = 'application/x-cadence-item';

export const DROP_HIGHLIGHT_CLASS =
    'ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-500/20';

const targetKey = ({ kind, uid }: DropTarget) => `${kind}:${uid}`;

const DROP_KINDS: DropTargetKind[] = ['project', 'tag', 'area', 'day'];

const parseTargetKey = (value: string | null): DropTarget | null => {
    if (!value) return null;
    const split = value.indexOf(':');
    const kind = value.slice(0, split) as DropTargetKind;
    const uid = value.slice(split + 1);
    return split > 0 && uid && DROP_KINDS.includes(kind) ? { kind, uid } : null;
};

// Spread on a sidebar row to make it a drop target.
export const dropTargetAttrs = (
    kind: DropTargetKind,
    uid: string
): Record<string, string> => ({
    [DROP_TARGET_ATTR]: targetKey({ kind, uid }),
});

const isRecurring = (task: Task) =>
    (!!task.recurrence_type && task.recurrence_type !== 'none') ||
    !!task.recurring_parent_id;

// Items that no target can take: occurrences that only exist on screen,
// and tasks mirrored from a TODO.md file (read-only here).
const canDrag = (item: DragItem): boolean => {
    switch (item.kind) {
        case 'task':
            return (
                !!item.task.uid &&
                !item.task.is_virtual_occurrence &&
                !item.task.source_key
            );
        case 'note':
            return !!item.note.uid;
        case 'project':
            return !!item.project.uid;
    }
};

const canDrop = (item: DragItem, target: DropTarget): boolean => {
    if (!canDrag(item)) return false;
    switch (target.kind) {
        case 'project':
            return item.kind === 'task' || item.kind === 'note';
        case 'tag':
            return item.kind === 'task' || item.kind === 'note';
        case 'area':
            // A sub-project's area follows its parent's.
            return (
                item.kind === 'task' ||
                (item.kind === 'project' && !item.project.parent_project_uid)
            );
        case 'day':
            // Moving one date of a series is the occurrence move's job.
            return item.kind === 'task' && !isRecurring(item.task);
    }
};

const targetFromElement = (
    element: Element | null,
    item: DragItem
): DropTarget | null => {
    const target = parseTargetKey(
        element
            ?.closest(`[${DROP_TARGET_ATTR}]`)
            ?.getAttribute(DROP_TARGET_ATTR) ?? null
    );
    return target && canDrop(item, target) ? target : null;
};

// Everything under a point, topmost first. The dragged row or a drag
// preview sits right under the pointer, so the target is looked for below
// it, not only at the top.
const elementsAt = ({ x, y }: DragPoint): Element[] => {
    if (typeof document.elementsFromPoint === 'function') {
        return document.elementsFromPoint(x, y);
    }
    if (typeof document.elementFromPoint === 'function') {
        const element = document.elementFromPoint(x, y);
        return element ? [element] : [];
    }
    return [];
};

// The target under a point that takes the item, if any.
export const dropTargetAt = (
    point: DragPoint | null,
    item: DragItem
): DropTarget | null => {
    if (!point) return null;
    for (const element of elementsAt(point)) {
        if (element.closest(`[${DROP_TARGET_ATTR}]`)) {
            return targetFromElement(element, item);
        }
    }
    return null;
};

// Where the pointer is during a dnd-kit drag: the point the drag started
// from (the activator event) plus dnd-kit's movement since then. Keyboard
// drags have no pointer, so they give null.
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

let announcedKey: string | null = null;

export const announceDropHover = (target: DropTarget | null): void => {
    const key = target ? targetKey(target) : null;
    if (key === announcedKey) return;
    announcedKey = key;
    window.dispatchEvent(
        new CustomEvent<string | null>(SIDEBAR_DRAG_HOVER_EVENT, {
            detail: key,
        })
    );
};

// For a sidebar section: tells whether a row is the target under a drag.
export const useDropHover = (): ((
    kind: DropTargetKind,
    uid: string | undefined
) => boolean) => {
    const [hovered, setHovered] = useState<string | null>(null);
    useEffect(() => {
        const onHover = (event: Event) =>
            setHovered((event as CustomEvent<string | null>).detail ?? null);
        window.addEventListener(SIDEBAR_DRAG_HOVER_EVENT, onHover);
        return () =>
            window.removeEventListener(SIDEBAR_DRAG_HOVER_EVENT, onHover);
    }, []);
    return (kind, uid) => !!uid && hovered === targetKey({ kind, uid });
};

const tagNames = (tags: { name: string }[] | undefined) =>
    (tags ?? []).map((tag) => tag.name);

const withTag = (names: string[], name: string) =>
    [...names, name].map((tagName) => ({ name: tagName }));

const findTag = (uid: string) =>
    useStore.getState().tagsStore.tags.find((tag) => tag.uid === uid);

const findArea = (uid: string) =>
    useStore.getState().areasStore.areas.find((area) => area.uid === uid);

const dueDateFor = (day: string) => {
    const date = new Date();
    if (day === 'tomorrow') date.setDate(date.getDate() + 1);
    return toYmd(date);
};

const announceTask = (task: Task) =>
    window.dispatchEvent(
        new CustomEvent<Task>(TASK_UPDATED_EVENT, { detail: task })
    );

const taskPatch = async (
    task: Task,
    target: DropTarget
): Promise<Partial<Task> | null> => {
    switch (target.kind) {
        case 'project':
            return (task.project_uid ?? task.Project?.uid) === target.uid
                ? null
                : { project_uid: target.uid };
        case 'tag': {
            const tag = findTag(target.uid);
            if (!tag) return null;
            // List rows do not always carry every tag; the saved list
            // replaces them all, so start from the stored task.
            const current = tagNames(
                (await fetchTaskByUid(task.uid as string)).tags
            );
            return current.includes(tag.name)
                ? null
                : { tags: withTag(current, tag.name) as Task['tags'] };
        }
        case 'area': {
            const area = findArea(target.uid);
            if (!area?.id || task.area_id === area.id) return null;
            return { area_id: area.id };
        }
        case 'day': {
            const date = dueDateFor(target.uid);
            return task.due_date?.slice(0, 10) === date
                ? null
                : { due_date: date };
        }
    }
};

const notePatch = async (
    note: Note,
    target: DropTarget
): Promise<Partial<Note> | null> => {
    if (target.kind === 'project') {
        const current =
            note.project_uid ?? note.project?.uid ?? note.Project?.uid;
        return current === target.uid ? null : { project_uid: target.uid };
    }
    const tag = findTag(target.uid);
    if (!tag) return null;
    const stored = await fetchNoteBySlug(note.uid as string);
    const current = tagNames(stored.Tags ?? stored.tags);
    return current.includes(tag.name)
        ? null
        : { tags: withTag(current, tag.name) as Note['tags'] };
};

// Saves what a drop means, then refreshes what shows the item. Resolves
// false when the item already had it (nothing saved); rejects when the
// save fails.
export const applyDrop = async (
    item: DragItem,
    target: DropTarget
): Promise<boolean> => {
    if (!canDrop(item, target)) return false;

    if (item.kind === 'task') {
        const patch = await taskPatch(item.task, target);
        if (!patch) return false;
        announceTask(await updateTask(item.task.uid as string, patch));
        return true;
    }

    if (item.kind === 'note') {
        const uid = item.note.uid as string;
        const patch = await notePatch(item.note, target);
        if (!patch) return false;
        const saved = await updateNote(uid, patch as Note);
        const { notes, setNotes } = useStore.getState().notesStore;
        setNotes(
            notes.map((note) =>
                note.uid === uid ? { ...note, ...saved, uid } : note
            )
        );
        return true;
    }

    const area = findArea(target.uid);
    if (!area?.id || item.project.area_id === area.id) return false;
    await updateProject(item.project.uid as string, { area_id: area.id });
    // The server also files sub-projects and keeps a shared project's area
    // per person, so reload rather than guess.
    useStore.getState().projectsStore.setProjects(await fetchProjects());
    return true;
};

// Set by a native drag source while its drag runs.
let nativeDrag: { item: DragItem; onError: () => void } | null = null;

const elementOf = (event: Event): Element | null =>
    event.target instanceof Element ? event.target : null;

const onNativeDragOver = (event: DragEvent) => {
    const target = nativeDrag
        ? targetFromElement(elementOf(event), nativeDrag.item)
        : null;
    announceDropHover(target);
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
};

const onNativeDrop = (event: DragEvent) => {
    const drag = nativeDrag;
    const target = drag ? targetFromElement(elementOf(event), drag.item) : null;
    stopNativeDrag();
    if (!drag || !target) return;
    event.preventDefault();
    applyDrop(drag.item, target).catch(drag.onError);
};

function stopNativeDrag() {
    nativeDrag = null;
    announceDropHover(null);
    document.removeEventListener('dragover', onNativeDragOver);
    document.removeEventListener('drop', onNativeDrop);
    document.removeEventListener('dragend', stopNativeDrag);
}

const startNativeDrag = (item: DragItem, onError: () => void) => {
    stopNativeDrag();
    nativeDrag = { item, onError };
    document.addEventListener('dragover', onNativeDragOver);
    document.addEventListener('drop', onNativeDrop);
    document.addEventListener('dragend', stopNativeDrag);
};

const itemUid = (item: DragItem) =>
    item.kind === 'task'
        ? item.task.uid
        : item.kind === 'note'
          ? item.note.uid
          : item.project.uid;

export interface NativeDragSourceProps {
    draggable?: true;
    onDragStart?: (event: React.DragEvent<Element>) => void;
}

// Spread on a row of a list without dnd-kit to make it draggable onto the
// sidebar. Items no target takes stay undraggable.
export const nativeDragSourceProps = (
    item: DragItem | null,
    onError: () => void
): NativeDragSourceProps => {
    if (!item || !canDrag(item)) return {};
    return {
        draggable: true,
        onDragStart: (event) => {
            // A row inside another draggable row starts only its own drag.
            event.stopPropagation();
            const transfer = event.dataTransfer;
            if (transfer) {
                transfer.effectAllowed = 'move';
                transfer.setData(
                    DRAG_ITEM_TYPE,
                    JSON.stringify({ kind: item.kind, uid: itemUid(item) })
                );
            }
            startNativeDrag(item, onError);
        },
    };
};

// True on rows that may take a native drag: a plain list turns it on, and
// SortableItem turns it off again for the rows dnd-kit drags.
export const NativeTaskDragContext = createContext(false);

interface DndKitDragEvent {
    activatorEvent: unknown;
    delta: DragPoint;
}

// The sidebar side of a list's drag: dnd-kit lists call dragMove and
// dragEnd from their DndContext; dragEnd returns true when the drop landed
// on a sidebar target, so the list skips its own reordering.
// Lists also render outside a ToastProvider (tests, embeds); the drop then
// fails silently instead of breaking the list. useToast reads the context
// first on every render, so the hook order never changes.
const useToastIfAny = () => {
    try {
        return useToast();
    } catch {
        return undefined;
    }
};

export const useSidebarDrop = () => {
    const { t } = useTranslation();
    const toast = useToastIfAny();

    return useMemo(() => {
        const onError = () =>
            toast?.showErrorToast(
                t('sidebarDrop.failed', 'Could not update this item.')
            );
        const targetFor = (event: DndKitDragEvent, item: DragItem | null) =>
            item
                ? dropTargetAt(
                      dragPointer(event.activatorEvent, event.delta),
                      item
                  )
                : null;

        return {
            dragMove: (event: DndKitDragEvent, item: DragItem | null) =>
                announceDropHover(targetFor(event, item)),
            dragEnd: (event: DndKitDragEvent, item: DragItem | null) => {
                const target = targetFor(event, item);
                announceDropHover(null);
                if (!item || !target) return false;
                // The click that ends the drag must not open the row it
                // lands on.
                swallowNextClick();
                applyDrop(item, target).catch(onError);
                return true;
            },
            dragCancel: () => announceDropHover(null),
            nativeSource: (item: DragItem | null) =>
                nativeDragSourceProps(item, onError),
        };
    }, [t, toast]);
};

import { act, fireEvent } from '@testing-library/react';
import {
    applyDrop,
    dragPointer,
    dropTargetAt,
    dropTargetAttrs,
    DragItem,
    nativeDragSourceProps,
    SIDEBAR_DRAG_HOVER_EVENT,
} from '../sidebarDrop';
import { fetchTaskByUid, updateTask } from '../../../utils/tasksService';
import { fetchNoteBySlug, updateNote } from '../../../utils/notesService';
import { fetchProjects, updateProject } from '../../../utils/projectsService';
import { useStore } from '../../../store/useStore';
import { TASK_UPDATED_EVENT } from '../../../contexts/TaskPaneContext';
import {
    getTodayDateString,
    getTomorrowDateString,
} from '../../../utils/dateUtils';

jest.mock('../../../utils/tasksService', () => ({
    updateTask: jest.fn(),
    fetchTaskByUid: jest.fn(),
}));

jest.mock('../../../utils/notesService', () => ({
    updateNote: jest.fn(),
    fetchNoteBySlug: jest.fn(),
}));

jest.mock('../../../utils/projectsService', () => ({
    updateProject: jest.fn(),
    fetchProjects: jest.fn(),
}));

const task = (extra: Record<string, unknown> = {}): DragItem => ({
    kind: 'task',
    task: { uid: 't1', name: 'Call', status: 0, completed_at: null, ...extra },
});
const note = (extra: Record<string, unknown> = {}): DragItem => ({
    kind: 'note',
    note: { uid: 'n1', title: 'Idea', content: '', ...extra },
});
const project = (extra: Record<string, unknown> = {}): DragItem => ({
    kind: 'project',
    project: { uid: 'p1', name: 'Home', ...extra },
});

const target = (kind: string, uid: string): HTMLElement => {
    const row = document.createElement('div');
    const attrs = dropTargetAttrs(kind as any, uid);
    Object.entries(attrs).forEach(([name, value]) =>
        row.setAttribute(name, value)
    );
    const label = document.createElement('span');
    row.appendChild(label);
    document.body.appendChild(row);
    return label;
};

beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    (updateTask as jest.Mock).mockImplementation(async (uid, body) => ({
        uid,
        ...body,
    }));
    (updateNote as jest.Mock).mockImplementation(async (uid, body) => ({
        uid,
        ...body,
    }));
    (updateProject as jest.Mock).mockImplementation(async (uid, body) => ({
        uid,
        ...body,
    }));
    (fetchProjects as jest.Mock).mockResolvedValue([
        { uid: 'p1', name: 'Home', area_id: 7 },
    ]);
    useStore.setState((state: any) => ({
        tagsStore: {
            ...state.tagsStore,
            tags: [
                { id: 1, uid: 'g1', name: 'perso' },
                { id: 2, uid: 'g2', name: 'perso/sport' },
            ],
        },
        areasStore: {
            ...state.areasStore,
            areas: [{ id: 7, uid: 'a7', name: 'Work' }],
        },
        notesStore: {
            ...state.notesStore,
            notes: [
                { uid: 'n0', title: 'First', content: '' },
                { uid: 'n1', title: 'Idea', content: '' },
            ],
        },
        projectsStore: {
            ...state.projectsStore,
            projects: [{ uid: 'p1', name: 'Home', area_id: null }],
        },
    }));
});

describe('dropTargetAt', () => {
    it('finds the target row under the point, from any child', () => {
        const label = target('project', 'p9');
        (document as any).elementFromPoint = jest.fn(() => label);

        expect(dropTargetAt({ x: 5, y: 5 }, task())).toEqual({
            kind: 'project',
            uid: 'p9',
        });
        expect(document.elementFromPoint).toHaveBeenCalledWith(5, 5);
    });

    it('looks under the dragged row that sits beneath the pointer', () => {
        const label = target('tag', 'g2');
        const dragged = document.createElement('div');
        (document as any).elementsFromPoint = jest.fn(() => [
            dragged,
            label,
            document.body,
        ]);

        expect(dropTargetAt({ x: 5, y: 5 }, task())).toEqual({
            kind: 'tag',
            uid: 'g2',
        });
        delete (document as any).elementsFromPoint;
    });

    it('gives null off the sidebar and without a pointer', () => {
        (document as any).elementFromPoint = jest.fn(() => document.body);

        expect(dropTargetAt({ x: 5, y: 5 }, task())).toBeNull();
        expect(dropTargetAt(null, task())).toBeNull();
    });

    it('ignores targets that do not take the dragged kind', () => {
        const area = target('area', 'a7');
        const day = target('day', 'today');
        const tag = target('tag', 'g2');

        (document as any).elementFromPoint = jest.fn(() => area);
        expect(dropTargetAt({ x: 1, y: 1 }, note())).toBeNull();
        expect(dropTargetAt({ x: 1, y: 1 }, task())).not.toBeNull();
        expect(dropTargetAt({ x: 1, y: 1 }, project())).not.toBeNull();
        // A sub-project's area is its parent's.
        expect(
            dropTargetAt({ x: 1, y: 1 }, project({ parent_project_uid: 'p0' }))
        ).toBeNull();

        (document as any).elementFromPoint = jest.fn(() => day);
        expect(dropTargetAt({ x: 1, y: 1 }, note())).toBeNull();
        expect(dropTargetAt({ x: 1, y: 1 }, project())).toBeNull();
        expect(
            dropTargetAt({ x: 1, y: 1 }, task({ recurrence_type: 'daily' }))
        ).toBeNull();

        (document as any).elementFromPoint = jest.fn(() => tag);
        expect(dropTargetAt({ x: 1, y: 1 }, project())).toBeNull();
        expect(dropTargetAt({ x: 1, y: 1 }, note())).not.toBeNull();
    });
});

describe('dragPointer', () => {
    it('adds the drag delta to the start point, and has none for keys', () => {
        expect(
            dragPointer({ clientX: 10, clientY: 20 }, { x: 5, y: -5 })
        ).toEqual({ x: 15, y: 15 });
        expect(
            dragPointer(new KeyboardEvent('keydown'), { x: 5, y: 5 })
        ).toBeNull();
    });
});

describe('applyDrop on a task', () => {
    it('moves it to a project and announces the saved task', async () => {
        const saved = jest.fn();
        window.addEventListener(TASK_UPDATED_EVENT, saved);

        await expect(
            applyDrop(task(), { kind: 'project', uid: 'p9' })
        ).resolves.toBe(true);

        expect(updateTask).toHaveBeenCalledWith('t1', { project_uid: 'p9' });
        expect((saved.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
            uid: 't1',
            project_uid: 'p9',
        });
        window.removeEventListener(TASK_UPDATED_EVENT, saved);
    });

    it('does nothing when it is already in that project', async () => {
        await expect(
            applyDrop(task({ project_uid: 'p9' }), {
                kind: 'project',
                uid: 'p9',
            })
        ).resolves.toBe(false);
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('adds the tag by its full path and keeps the others', async () => {
        (fetchTaskByUid as jest.Mock).mockResolvedValue({
            uid: 't1',
            tags: [{ name: 'work' }],
        });

        await applyDrop(task({ tags: [] }), { kind: 'tag', uid: 'g2' });

        expect(fetchTaskByUid).toHaveBeenCalledWith('t1');
        expect(updateTask).toHaveBeenCalledWith('t1', {
            tags: [{ name: 'work' }, { name: 'perso/sport' }],
        });
    });

    it('does nothing when it already has the tag', async () => {
        (fetchTaskByUid as jest.Mock).mockResolvedValue({
            uid: 't1',
            tags: [{ name: 'perso/sport' }],
        });

        await expect(
            applyDrop(task(), { kind: 'tag', uid: 'g2' })
        ).resolves.toBe(false);
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('gives it the area by id', async () => {
        await applyDrop(task(), { kind: 'area', uid: 'a7' });

        expect(updateTask).toHaveBeenCalledWith('t1', { area_id: 7 });
    });

    it('makes it due today or tomorrow', async () => {
        await applyDrop(task(), { kind: 'day', uid: 'today' });
        expect(updateTask).toHaveBeenLastCalledWith('t1', {
            due_date: getTodayDateString(),
        });

        await applyDrop(task(), { kind: 'day', uid: 'tomorrow' });
        expect(updateTask).toHaveBeenLastCalledWith('t1', {
            due_date: getTomorrowDateString(),
        });
    });

    it('does nothing when it is already due that day', async () => {
        await expect(
            applyDrop(task({ due_date: `${getTodayDateString()}T00:00:00Z` }), {
                kind: 'day',
                uid: 'today',
            })
        ).resolves.toBe(false);
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('rejects when the save fails, so the caller can say so', async () => {
        (updateTask as jest.Mock).mockRejectedValue(new Error('nope'));

        await expect(
            applyDrop(task(), { kind: 'project', uid: 'p9' })
        ).rejects.toThrow('nope');
    });
});

describe('applyDrop on a note', () => {
    it('moves it to a project and updates the notes store in place', async () => {
        await applyDrop(note(), { kind: 'project', uid: 'p9' });

        expect(updateNote).toHaveBeenCalledWith('n1', { project_uid: 'p9' });
        const notes = useStore.getState().notesStore.notes;
        expect(notes.map((n) => n.uid)).toEqual(['n0', 'n1']);
        expect(notes[1]).toMatchObject({ uid: 'n1', project_uid: 'p9' });
    });

    it('does nothing when it is already in that project', async () => {
        await expect(
            applyDrop(note({ Project: { id: 9, uid: 'p9', name: 'W' } }), {
                kind: 'project',
                uid: 'p9',
            })
        ).resolves.toBe(false);
        expect(updateNote).not.toHaveBeenCalled();
    });

    it('adds the tag and keeps the others, once', async () => {
        (fetchNoteBySlug as jest.Mock).mockResolvedValue({
            uid: 'n1',
            Tags: [{ name: 'perso' }],
        });

        await applyDrop(note(), { kind: 'tag', uid: 'g2' });
        expect(fetchNoteBySlug).toHaveBeenCalledWith('n1');
        expect(updateNote).toHaveBeenCalledWith('n1', {
            tags: [{ name: 'perso' }, { name: 'perso/sport' }],
        });

        (updateNote as jest.Mock).mockClear();
        await expect(
            applyDrop(note(), { kind: 'tag', uid: 'g1' })
        ).resolves.toBe(false);
        expect(updateNote).not.toHaveBeenCalled();
    });
});

describe('applyDrop on a project', () => {
    it('files it in the area, then reloads the projects', async () => {
        await applyDrop(project(), { kind: 'area', uid: 'a7' });

        expect(updateProject).toHaveBeenCalledWith('p1', { area_id: 7 });
        expect(fetchProjects).toHaveBeenCalled();
        expect(useStore.getState().projectsStore.projects[0].area_id).toBe(7);
    });

    it('does nothing when it is already in that area', async () => {
        await expect(
            applyDrop(project({ area_id: 7 }), { kind: 'area', uid: 'a7' })
        ).resolves.toBe(false);
        expect(updateProject).not.toHaveBeenCalled();
    });
});

describe('native drag from a list without dnd-kit', () => {
    const dataTransfer = () => ({
        setData: jest.fn(),
        effectAllowed: '',
        dropEffect: '',
    });

    it('highlights the target under a native drag and applies the drop', async () => {
        const source = document.createElement('div');
        document.body.appendChild(source);
        const onError = jest.fn();
        const props = nativeDragSourceProps(task(), onError);
        expect(props.draggable).toBe(true);
        source.addEventListener('dragstart', (e) =>
            props.onDragStart!(e as any)
        );
        const label = target('project', 'p9');
        const hover = jest.fn();
        window.addEventListener(SIDEBAR_DRAG_HOVER_EVENT, hover);

        const transfer = dataTransfer();
        fireEvent.dragStart(source, { dataTransfer: transfer });
        expect(transfer.setData).toHaveBeenCalledWith(
            'application/x-cadence-item',
            JSON.stringify({ kind: 'task', uid: 't1' })
        );

        const over = fireEvent.dragOver(label, { dataTransfer: transfer });
        // false: the default was prevented, so the browser allows the drop.
        expect(over).toBe(false);
        expect(hover.mock.calls[0][0].detail).toBe('project:p9');

        await act(async () => {
            fireEvent.drop(label, { dataTransfer: transfer });
        });
        expect(updateTask).toHaveBeenCalledWith('t1', { project_uid: 'p9' });
        expect(hover.mock.calls[hover.mock.calls.length - 1][0].detail).toBe(
            null
        );
        expect(onError).not.toHaveBeenCalled();
        window.removeEventListener(SIDEBAR_DRAG_HOVER_EVENT, hover);
    });

    it('does not allow a drop on a target that refuses the item', () => {
        const source = document.createElement('div');
        document.body.appendChild(source);
        const props = nativeDragSourceProps(note(), jest.fn());
        source.addEventListener('dragstart', (e) =>
            props.onDragStart!(e as any)
        );
        const day = target('day', 'today');

        fireEvent.dragStart(source, { dataTransfer: dataTransfer() });
        expect(fireEvent.dragOver(day, { dataTransfer: dataTransfer() })).toBe(
            true
        );
        fireEvent.dragEnd(source);
    });

    it('makes nothing draggable for items no target can take', () => {
        expect(
            nativeDragSourceProps(
                task({ is_virtual_occurrence: true }),
                jest.fn()
            )
        ).toEqual({});
        expect(
            nativeDragSourceProps(task({ source_key: 'k' }), jest.fn())
        ).toEqual({});
    });
});

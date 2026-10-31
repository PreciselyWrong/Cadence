import React from 'react';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskList from '../TaskList';
import { updateTask } from '../../../utils/tasksService';
import { TASK_UPDATED_EVENT } from '../../../contexts/TaskPaneContext';
import {
    NativeTaskDragContext,
    SIDEBAR_DRAG_HOVER_EVENT,
} from '../../Sidebar/sidebarDrop';

let mockDnd: any = {};
let mockIsMinimal = true;

jest.mock('@dnd-kit/core', () => {
    const actual = jest.requireActual('@dnd-kit/core');
    return {
        ...actual,
        DndContext: (props: any) => {
            mockDnd = props;
            return props.children;
        },
    };
});

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => mockIsMinimal,
}));

jest.mock('../../../utils/tasksService', () => ({
    updateTask: jest.fn(),
}));

// The row reads the context to decide whether it is a native drag source.
jest.mock('../TaskItem', () => {
    const React = jest.requireActual('react');
    const { NativeTaskDragContext } = jest.requireActual(
        '../../Sidebar/sidebarDrop'
    );
    return {
        __esModule: true,
        default: ({ task }: any) => {
            const native = React.useContext(NativeTaskDragContext);
            return React.createElement(
                'div',
                native ? { 'data-testid': 'native-drag-row' } : null,
                task.name
            );
        },
    };
});

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const tasks: any[] = [
    { id: 1, uid: 'u1', name: 'One', status: 0 },
    { id: 2, uid: 'u2', name: 'Two', status: 0 },
    { id: 3, uid: 'u3', name: 'Three', status: 0 },
];

// The drag started at (100, 200); `pointer` is where it is released.
const dragEvent = (overId: string | null, pointer = { x: 0, y: 0 }) => ({
    active: { id: 'u1' },
    over: overId ? { id: overId } : null,
    activatorEvent: { clientX: 100, clientY: 200 },
    delta: { x: pointer.x - 100, y: pointer.y - 200 },
});

let sidebarProject: HTMLElement;

beforeEach(() => {
    mockIsMinimal = true;
    (updateTask as jest.Mock).mockReset();
    (updateTask as jest.Mock).mockImplementation(async (uid, body) => ({
        uid,
        ...body,
    }));
    sidebarProject = document.createElement('div');
    sidebarProject.setAttribute('data-sidebar-drop', 'project:p9');
    document.body.appendChild(sidebarProject);
    // jsdom has no hit testing: the pointer is over the sidebar only when a test says so.
    (document as any).elementFromPoint = jest.fn(() => null);
});

afterEach(() => {
    sidebarProject.remove();
});

const renderList = (onReorder = jest.fn()) => {
    render(
        <TaskList
            tasks={tasks}
            onTaskUpdate={jest.fn()}
            onTaskDelete={jest.fn()}
            projects={[]}
            onReorder={onReorder}
        />
    );
    return { onReorder };
};

describe('TaskList drag onto the sidebar', () => {
    it('reorders the shown uids when the drop is inside the list', () => {
        const { onReorder } = renderList();

        act(() => mockDnd.onDragEnd(dragEvent('u3')));

        expect(onReorder).toHaveBeenCalledWith(['u2', 'u3', 'u1']);
        expect(updateTask).not.toHaveBeenCalled();
    });

    it('moves the task to the sidebar project under the pointer', async () => {
        (document as any).elementFromPoint = jest.fn(() => sidebarProject);
        const { onReorder } = renderList();
        const saved = jest.fn();
        window.addEventListener(TASK_UPDATED_EVENT, saved);

        await act(async () => {
            await mockDnd.onDragEnd(dragEvent('u3', { x: 20, y: 40 }));
        });

        expect(updateTask).toHaveBeenCalledWith('u1', { project_uid: 'p9' });
        expect(onReorder).not.toHaveBeenCalled();
        expect(saved).toHaveBeenCalledTimes(1);
        expect((saved.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
            uid: 'u1',
            project_uid: 'p9',
        });
        window.removeEventListener(TASK_UPDATED_EVENT, saved);
    });

    it('announces the project under the pointer while dragging, then clears it', () => {
        (document as any).elementFromPoint = jest.fn(() => sidebarProject);
        renderList();
        const hover = jest.fn();
        window.addEventListener(SIDEBAR_DRAG_HOVER_EVENT, hover);

        act(() => mockDnd.onDragMove(dragEvent('u2', { x: 20, y: 40 })));
        expect(hover.mock.calls[0][0].detail).toBe('project:p9');

        act(() => mockDnd.onDragEnd(dragEvent('u2', { x: 20, y: 40 })));
        expect(
            hover.mock.calls[hover.mock.calls.length - 1][0].detail
        ).toBeNull();
        window.removeEventListener(SIDEBAR_DRAG_HOVER_EVENT, hover);
    });

    it('moves tasks in Dense too', async () => {
        mockIsMinimal = false;
        (document as any).elementFromPoint = jest.fn(() => sidebarProject);
        const { onReorder } = renderList();

        await act(async () => {
            await mockDnd.onDragEnd(dragEvent('u3', { x: 20, y: 40 }));
        });

        expect(updateTask).toHaveBeenCalledWith('u1', { project_uid: 'p9' });
        expect(onReorder).not.toHaveBeenCalled();
    });

    it('lets plain rows (no reordering) take a native drag', () => {
        render(
            <TaskList
                tasks={tasks}
                onTaskUpdate={jest.fn()}
                onTaskDelete={jest.fn()}
                projects={[]}
            />
        );

        expect(
            screen
                .getAllByTestId('native-drag-row')
                .map((row) => row.textContent)
        ).toEqual(['One', 'Two', 'Three']);
    });

    it('keeps native drag off rows dnd-kit sorts, even inside a plain list', () => {
        render(
            <NativeTaskDragContext.Provider value={true}>
                <TaskList
                    tasks={tasks}
                    onTaskUpdate={jest.fn()}
                    onTaskDelete={jest.fn()}
                    projects={[]}
                    onReorder={jest.fn()}
                />
            </NativeTaskDragContext.Provider>
        );

        expect(screen.queryByTestId('native-drag-row')).toBeNull();
    });
});

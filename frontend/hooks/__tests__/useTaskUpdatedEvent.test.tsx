import { act, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useTaskUpdatedEvent } from '../useTaskUpdatedEvent';
import { TASK_UPDATED_EVENT } from '../../contexts/TaskPaneContext';
import { Task } from '../../entities/Task';

const savedTask = { id: 7, uid: 'task-7', name: 'Saved' } as Task;

const dispatch = (detail: unknown) =>
    window.dispatchEvent(new CustomEvent(TASK_UPDATED_EVENT, { detail }));

describe('useTaskUpdatedEvent', () => {
    it('passes the saved task from a task-updated event to the handler', () => {
        const onUpdated = jest.fn();
        renderHook(() => useTaskUpdatedEvent(onUpdated));

        act(() => dispatch(savedTask));

        expect(onUpdated).toHaveBeenCalledTimes(1);
        expect(onUpdated).toHaveBeenCalledWith(savedTask);
    });

    it('stops listening after unmount', () => {
        const onUpdated = jest.fn();
        const { unmount } = renderHook(() => useTaskUpdatedEvent(onUpdated));

        unmount();
        act(() => dispatch(savedTask));

        expect(onUpdated).not.toHaveBeenCalled();
    });

    it('calls the latest handler without re-subscribing', () => {
        const first = jest.fn();
        const second = jest.fn();
        const addSpy = jest.spyOn(window, 'addEventListener');
        const { rerender } = renderHook(
            ({ handler }) => useTaskUpdatedEvent(handler),
            { initialProps: { handler: first } }
        );

        rerender({ handler: second });
        act(() => dispatch(savedTask));

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith(savedTask);
        expect(
            addSpy.mock.calls.filter(([type]) => type === TASK_UPDATED_EVENT)
        ).toHaveLength(1);
        addSpy.mockRestore();
    });

    it('ignores events without a task uid', () => {
        const onUpdated = jest.fn();
        renderHook(() => useTaskUpdatedEvent(onUpdated));

        act(() => dispatch(null));
        act(() => dispatch({ id: 1 }));

        expect(onUpdated).not.toHaveBeenCalled();
    });
});

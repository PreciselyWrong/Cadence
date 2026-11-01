import {
    UNDO_WINDOW_MS,
    deferDelete,
    flushDeferredDeletes,
} from '../deferredDelete';

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    flushDeferredDeletes();
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('deferDelete', () => {
    it('commits only once the undo window has closed', async () => {
        const commit = jest.fn().mockResolvedValue(undefined);
        deferDelete('task:1', commit);

        jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
        expect(commit).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(commit).toHaveBeenCalledWith({ keepalive: false });
    });

    it('never commits a delete that was undone', async () => {
        const commit = jest.fn().mockResolvedValue(undefined);
        const undo = deferDelete('task:1', commit);

        expect(undo()).toBe(true);
        jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
        expect(commit).not.toHaveBeenCalled();
    });

    it('reports an undo that came after the commit as too late', () => {
        const commit = jest.fn().mockResolvedValue(undefined);
        const undo = deferDelete('task:1', commit);

        jest.advanceTimersByTime(UNDO_WINDOW_MS);
        expect(undo()).toBe(false);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('commits a pending delete with keepalive when the page is left', () => {
        const commit = jest.fn().mockResolvedValue(undefined);
        deferDelete('note:1', commit);

        window.dispatchEvent(new Event('pagehide'));
        expect(commit).toHaveBeenCalledWith({ keepalive: true });

        jest.advanceTimersByTime(UNDO_WINDOW_MS);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('hands a failed commit to its error handler', async () => {
        const failure = new Error('offline');
        const onError = jest.fn();
        deferDelete('inbox:1', () => Promise.reject(failure), onError);

        jest.advanceTimersByTime(UNDO_WINDOW_MS);
        await Promise.resolve();
        await Promise.resolve();
        expect(onError).toHaveBeenCalledWith(failure);
    });
});

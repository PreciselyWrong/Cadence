import { scheduleTaskDelete } from '../taskDeleteUndo';

describe('scheduleTaskDelete', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const setup = (commit = jest.fn().mockResolvedValue(undefined)) => {
        const hide = jest.fn();
        const restore = jest.fn();
        const onCommitError = jest.fn();
        const scheduled = scheduleTaskDelete({
            hide,
            restore,
            commit,
            onCommitError,
            delayMs: 1000,
        });
        return { hide, restore, commit, onCommitError, scheduled };
    };

    it('hides now and deletes only after the undo window', () => {
        const { hide, commit } = setup();
        expect(hide).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(999);
        expect(commit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('undo restores the row and never deletes', () => {
        const { restore, commit, scheduled } = setup();
        scheduled.undo();
        jest.advanceTimersByTime(5000);
        expect(restore).toHaveBeenCalledTimes(1);
        expect(commit).not.toHaveBeenCalled();
    });

    it('restores the row and reports when the delete fails', async () => {
        const failing = jest.fn().mockRejectedValue(new Error('boom'));
        const { restore, onCommitError } = setup(failing);
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
        expect(restore).toHaveBeenCalledTimes(1);
        expect(onCommitError).toHaveBeenCalledTimes(1);
    });
});

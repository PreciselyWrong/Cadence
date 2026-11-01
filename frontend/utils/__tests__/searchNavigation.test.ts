import { searchDestination } from '../searchNavigation';

describe('searchDestination', () => {
    it('opens a goal on its page', () => {
        expect(
            searchDestination({
                type: 'Goal',
                uid: 'abc123',
                name: 'Run a Marathon!',
                title: 'Run a Marathon!',
            })
        ).toEqual({ kind: 'path', path: '/goal/abc123-run-a-marathon' });
    });

    it('opens a task in the task panel', () => {
        expect(
            searchDestination({ type: 'Task', uid: 't1', name: 'x' })
        ).toEqual({ kind: 'task', uid: 't1' });
    });

    it('gives nothing without a uid', () => {
        expect(searchDestination({ type: 'Goal', name: 'x' })).toBeNull();
    });
});

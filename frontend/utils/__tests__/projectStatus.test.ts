import { ProjectStatus } from '../../entities/Project';
import {
    isProjectClosed,
    isProjectInStash,
    isProjectLive,
} from '../projectStatus';

describe('projectStatus', () => {
    const live: ProjectStatus[] = [
        'not_started',
        'planned',
        'in_progress',
        'waiting',
    ];

    it.each(live)('keeps %s projects in the live list', (status) => {
        expect(isProjectLive(status)).toBe(true);
        expect(isProjectClosed(status)).toBe(false);
        expect(isProjectInStash(status)).toBe(false);
    });

    it('treats a project without status as live', () => {
        expect(isProjectLive(undefined)).toBe(true);
    });

    it('puts paused projects in the stash, not in the live list', () => {
        expect(isProjectInStash('paused')).toBe(true);
        expect(isProjectLive('paused')).toBe(false);
        expect(isProjectClosed('paused')).toBe(false);
    });

    it.each<ProjectStatus>(['done', 'cancelled', 'archived'])(
        'closes %s projects',
        (status) => {
            expect(isProjectClosed(status)).toBe(true);
            expect(isProjectLive(status)).toBe(false);
            expect(isProjectInStash(status)).toBe(false);
        }
    );
});

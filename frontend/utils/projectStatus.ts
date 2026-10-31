import { ProjectStatus } from '../entities/Project';

// Done, abandoned (`cancelled`) and archived projects are out of the way for
// good; a paused one sits in the stash until the user resumes it.
export const isProjectClosed = (status: ProjectStatus | undefined): boolean =>
    status === 'done' || status === 'cancelled' || status === 'archived';

export const isProjectInStash = (status: ProjectStatus | undefined): boolean =>
    status === 'paused';

// Projects that compete for attention today: neither closed nor in the stash.
export const isProjectLive = (status: ProjectStatus | undefined): boolean =>
    !isProjectClosed(status) && !isProjectInStash(status);

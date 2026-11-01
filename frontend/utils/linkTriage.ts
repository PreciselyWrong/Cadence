import { Link, LinkStatus } from '../entities/Link';
import { Task } from '../entities/Task';
import { createTask } from './tasksService';

export const linkTitle = (link: Link): string =>
    link.title || link.domain || link.url;

// The address first, then the user's note: the task keeps what it takes to
// find the link again and to know why it mattered.
export const linkTaskNote = (link: Link): string =>
    [link.url, link.note?.trim()].filter(Boolean).join('\n\n');

type SaveLink = (
    uid: string,
    changes: { status: LinkStatus }
) => Promise<unknown>;

// "Attach": a link has no project, so a task named after it, holding its
// address, files it in the chosen one; the link counts as kept. Same as
// Android (LinkTriage, LinkDecision.ATTACH).
export const attachLinkToProject = async (
    link: Link,
    projectUid: string,
    save: SaveLink
): Promise<Task> => {
    const task = await createTask({
        name: linkTitle(link),
        note: linkTaskNote(link),
        project_uid: projectUid,
    } as Task);
    await save(link.uid, { status: 'kept' });
    return task;
};

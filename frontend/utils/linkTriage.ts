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
    changes: { status: LinkStatus; project_uid?: string }
) => Promise<unknown>;

// One tap: a task named after the link, holding its address. The link counts
// as kept. Same as Android (LinkDecision.TASK).
export const linkToTask = async (link: Link, save: SaveLink): Promise<Task> => {
    const task = await createTask({
        name: linkTitle(link),
        note: linkTaskNote(link),
    } as Task);
    await save(link.uid, { status: 'kept' });
    return task;
};

// A link belongs to the chosen project itself, and counts as kept. Same as
// Android (LinkDecision.ATTACH).
export const attachLinkToProject = (
    link: Link,
    projectUid: string,
    save: SaveLink
): Promise<unknown> =>
    save(link.uid, { status: 'kept', project_uid: projectUid });

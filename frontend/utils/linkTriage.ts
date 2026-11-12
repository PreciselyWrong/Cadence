import { Task } from '../entities/Task';
import { processInboxItemWithStore } from './inboxService';
import { firstUrl, residualText } from './linkFilters';
import { createLink, NewLink } from './linksService';
import { createTask } from './tasksService';

// The site of an address, without "www.".
export const domainOf = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
        return '';
    }
};

// An address as a name: without the scheme and "www.".
export const addressLabel = (url: string): string =>
    url.replace(/^https?:\/\/(www\.)?/i, '');

// What was written around the first address of a text; the punctuation
// that followed the address stays with the words.
export const wordsAround = (text: string, url: string): string =>
    residualText(text, firstUrl(text) ?? url)
        .replace(/\s+([.,;:!?…])/g, '$1')
        .replace(/^[.,;:!?…]+$/, '');

// The task of a link: named after the page when its title is known, else
// after the words written with the address, else after its site. The note
// keeps the address, then the words the name did not take. Same rule on
// Android.
export const linkTaskDraft = ({
    url,
    title,
    text,
}: {
    url: string;
    title?: string | null;
    text?: string | null;
}): { name: string; note: string } => {
    const words = (text ?? '').trim();
    const name = title?.trim() || words || domainOf(url) || url;
    const rest = name === words ? '' : words;
    return { name, note: [url, rest].filter(Boolean).join('\n\n') };
};

// An address made a task in one gesture (docs/37-links.md, Capture): the
// address in the note, waiting in « Tâches à classer » for « Quand ? »
// unless a project is chosen. The idea leaves the inbox.
export interface CaptureDraft {
    url: string;
    name: string;
    note: string;
    tags?: string[];
    project_uid?: string;
}

export const captureAsTask = async (
    itemUid: string,
    draft: CaptureDraft
): Promise<Task> => {
    const task = await createTask({
        name: draft.name,
        note: draft.note,
        status: 'not_started',
        tags: (draft.tags ?? []).map((name) => ({ name })),
        project_uid: draft.project_uid,
        needs_when: !draft.project_uid,
        source: 'link',
        source_url: draft.url,
        completed_at: null,
    } as Task);
    await processInboxItemWithStore(itemUid, { task_uid: task.uid as string });
    return task;
};

export type LinkDraft = NewLink;

// The "Project…" decision of an inbox item: the page goes to the project,
// then the item leaves the inbox.
export const addToProject = async (
    itemUid: string,
    draft: LinkDraft
): Promise<void> => {
    const { link } = await createLink(draft);
    await processInboxItemWithStore(itemUid, { link_uid: link.uid });
};

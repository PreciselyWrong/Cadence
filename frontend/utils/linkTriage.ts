import { Link } from '../entities/Link';
import { Task } from '../entities/Task';
import { useLinksStore } from '../store/linksStore';
import { processInboxItemWithStore } from './inboxService';
import { firstUrl, residualText } from './linkFilters';
import { createLink, NewLink } from './linksService';
import { createTask } from './tasksService';

export const linkTitle = (link: Link): string =>
    link.title || link.domain || link.url;

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

// The address of an idea that is only a link: nothing else is written
// with it but #tags, a +project or an ~area.
export const linkOnlyAddress = (text: string): string | null => {
    if (text.trim().includes('\n')) return null;
    const url = firstUrl(text);
    if (!url) return null;
    const rest = residualText(text, url)
        .replace(/(^|\s)#[^\s#]+/g, ' ')
        .replace(/(^|\s)[+~](?:"[^"]+"|\S+)/g, ' ')
        .trim();
    return rest ? null : url;
};

// The task of a link: named after the page when its title is known, else
// after the words written with the address, else after its site. The note
// keeps the address, then the words the name did not take. Same rule on
// Android and from the Links page (the link's note being its words).
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

// "Create a task" from a saved link: the link stays as it is.
export const linkToTask = (link: Link): Promise<Task> =>
    createTask(
        linkTaskDraft({
            url: link.url,
            title: link.title,
            text: link.note,
        }) as Task
    );

export type LinkDraft = Omit<NewLink, 'source_type' | 'source_uid'>;

// The "Links" choice of the capture box, for an idea that is only a link:
// kept at once, with no inbox item behind it.
export const keepLink = async (draft: LinkDraft): Promise<Link> => {
    const { link } = await createLink(draft);
    useLinksStore.getState().add(link);
    return link;
};

// The "Links" decision of an inbox item: the link is created from it, then
// the item leaves the inbox.
export const keepInLinks = async (
    itemUid: string,
    draft: LinkDraft
): Promise<Link> => {
    const { link } = await createLink({
        ...draft,
        source_type: 'inbox_item',
        source_uid: itemUid,
    });
    useLinksStore.getState().add(link);
    await processInboxItemWithStore(itemUid, { link_uid: link.uid });
    return link;
};

import { Task } from '../../entities/Task';
import { domainOf } from '../../utils/linkTriage';
import { taskSource } from '../../utils/taskSource';
import { UrlPreview } from '../../utils/urlService';
import { addressesIn } from './LinkPreviews';

// The page a task points at: the first address of its note, else one typed
// as its name, shown on its row as the site's icon and name with the page's
// picture (docs/37-links.md, Rows).
export interface TaskLink {
    url: string;
    host: string;
    // The note without that address, for its preview line.
    noteRest: string;
    // The origin badge already shows this site's icon.
    iconInBadge: boolean;
    // The name is the address alone: rows show the page's title instead.
    nameIsLink: boolean;
}

export const taskLinkOf = (
    task: Pick<Task, 'note' | 'source' | 'source_url' | 'source_key'> & {
        name?: string | null;
    }
): TaskLink | null => {
    const inNote = addressesIn([task.note])[0];
    const url = inNote ?? addressesIn([task.name])[0];
    const host = url ? domainOf(url) : '';
    if (!url || !host) return null;
    const source = taskSource(task);
    return {
        url,
        host,
        noteRest: inNote ? (task.note ?? '').replace(url, '').trim() : '',
        iconInBadge: !!source?.url && domainOf(source.url) === host,
        nameIsLink: !inNote && (task.name ?? '').trim() === url,
    };
};

// A task's title on its row: a bare address reads as its page's title, else
// its host and path.
export const linkTitleOf = (
    name: string,
    link: TaskLink | null,
    preview: UrlPreview | null
): string => {
    if (!link?.nameIsLink) return name;
    const title = preview?.title?.trim();
    if (title) return title;
    try {
        const at = new URL(link.url);
        return `${link.host}${at.pathname.replace(/\/$/, '')}`;
    } catch {
        return name;
    }
};

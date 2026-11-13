import { Task } from '../../entities/Task';
import { domainOf } from '../../utils/linkTriage';
import { taskSource } from '../../utils/taskSource';
import { addressesIn } from './LinkPreviews';

// The page a task points at: the first address of its note, shown on its
// row as the site's icon and name with the page's picture
// (docs/37-links.md, Rows).
export interface TaskLink {
    url: string;
    host: string;
    // The note without that address, for its preview line.
    noteRest: string;
    // The origin badge already shows this site's icon.
    iconInBadge: boolean;
}

export const taskLinkOf = (
    task: Pick<Task, 'note' | 'source' | 'source_url' | 'source_key'>
): TaskLink | null => {
    const url = addressesIn([task.note])[0];
    const host = url ? domainOf(url) : '';
    if (!url || !host) return null;
    const source = taskSource(task);
    return {
        url,
        host,
        noteRest: (task.note ?? '').replace(url, '').trim(),
        iconInBadge: !!source?.url && domainOf(source.url) === host,
    };
};

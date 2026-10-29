import { Tag } from '../entities/Tag';

export interface TagTreeNode {
    tag: Tag;
    children: Tag[];
}

const byName = (a: Tag, b: Tag) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());

// Groups tags under their parent tag (one level deep). A tag whose parent is
// missing from the list is shown at the top level.
export const buildTagTree = (tags: Tag[]): TagTreeNode[] => {
    const uids = new Set(tags.map((tag) => tag.uid).filter(Boolean));
    const childrenByParent = new Map<string, Tag[]>();
    const roots: Tag[] = [];

    tags.forEach((tag) => {
        const parentUid = tag.parent_uid;
        if (parentUid && parentUid !== tag.uid && uids.has(parentUid)) {
            const list = childrenByParent.get(parentUid) || [];
            list.push(tag);
            childrenByParent.set(parentUid, list);
        } else {
            roots.push(tag);
        }
    });

    return roots.sort(byName).map((tag) => ({
        tag,
        children: (childrenByParent.get(tag.uid || '') || []).sort(byName),
    }));
};

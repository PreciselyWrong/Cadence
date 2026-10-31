import { Tag } from '../entities/Tag';

export interface TagTreeNode {
    tag: Tag;
    children: TagTreeNode[];
}

export interface FlatTagNode {
    tag: Tag;
    depth: number;
    hasChildren: boolean;
}

export const TAG_PATH_SEPARATOR = '/';

// A tag name is its namespace path (`perso/sport`); the leaf is what a tree
// row shows under its parent.
export const tagLeafName = (name: string): string =>
    name.slice(name.lastIndexOf(TAG_PATH_SEPARATOR) + 1);

const byName = (a: TagTreeNode, b: TagTreeNode) =>
    a.tag.name.toLowerCase().localeCompare(b.tag.name.toLowerCase());

// Nests tags by namespace, at any depth. The name is the source of truth, so
// optimistic tags without a uid or parent_uid still land in the right place.
// A tag whose direct parent is not listed hangs on its nearest listed
// ancestor, or sits at the top level.
export const buildTagTree = (tags: Tag[]): TagTreeNode[] => {
    const nodes = new Map<string, TagTreeNode>();
    tags.forEach((tag) => nodes.set(tag.name, { tag, children: [] }));

    const roots: TagTreeNode[] = [];
    nodes.forEach((node, name) => {
        let parent: TagTreeNode | undefined;
        let path = name;
        while (!parent && path.includes(TAG_PATH_SEPARATOR)) {
            path = path.slice(0, path.lastIndexOf(TAG_PATH_SEPARATOR));
            parent = nodes.get(path);
        }
        (parent ? parent.children : roots).push(node);
    });

    const sort = (list: TagTreeNode[]): TagTreeNode[] => {
        list.sort(byName).forEach((node) => sort(node.children));
        return list;
    };
    return sort(roots);
};

// Depth-first rows for rendering; children of a collapsed uid are skipped.
export const flattenTagTree = (
    nodes: TagTreeNode[],
    collapsed: Set<string> = new Set(),
    depth = 0
): FlatTagNode[] =>
    nodes.flatMap(({ tag, children }) => [
        { tag, depth, hasChildren: children.length > 0 },
        ...(collapsed.has(tag.uid || '')
            ? []
            : flattenTagTree(children, collapsed, depth + 1)),
    ]);

// The tag itself and every tag inside its namespace.
export const isSameOrDescendantTag = (name: string, ancestor: string) =>
    name === ancestor || name.startsWith(ancestor + TAG_PATH_SEPARATOR);

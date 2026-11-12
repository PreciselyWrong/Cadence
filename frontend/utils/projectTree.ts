import { Project } from '../entities/Project';

export interface ProjectTreeNode<T extends Project = Project> {
    project: T;
    depth: number;
}

// Orders projects for display: top-level projects keep their given order and
// each one is followed by its sub-projects (depth 1, 2, ...). A project whose
// parent is not in the list is shown at the top level.
export function flattenProjectTree<T extends Project>(
    projects: T[]
): ProjectTreeNode<T>[] {
    const uids = new Set(projects.map((project) => project.uid));
    const childrenByParent = new Map<string, T[]>();
    const roots: T[] = [];

    for (const project of projects) {
        const parentUid = project.parent_project_uid;
        if (parentUid && parentUid !== project.uid && uids.has(parentUid)) {
            childrenByParent.set(parentUid, [
                ...(childrenByParent.get(parentUid) ?? []),
                project,
            ]);
        } else {
            roots.push(project);
        }
    }

    const nodes: ProjectTreeNode<T>[] = [];
    const visited = new Set<T>();
    const visit = (project: T, depth: number) => {
        if (visited.has(project)) return;
        visited.add(project);
        nodes.push({ project, depth });
        for (const child of childrenByParent.get(project.uid ?? '') ?? []) {
            visit(child, depth + 1);
        }
    };

    roots.forEach((project) => visit(project, 0));
    // Projects that only point at each other are not reachable from a root;
    // show them rather than drop them.
    projects.forEach((project) => visit(project, 0));

    return nodes;
}

// Uids of every project below the given one (its sub-projects at any depth).
export function descendantUids(projects: Project[], uid: string): Set<string> {
    const found = new Set<string>();
    let frontier = [uid];
    while (frontier.length > 0) {
        const children = projects
            .filter(
                (project) =>
                    project.uid !== undefined &&
                    project.parent_project_uid !== undefined &&
                    project.parent_project_uid !== null &&
                    frontier.includes(project.parent_project_uid) &&
                    !found.has(project.uid) &&
                    project.uid !== uid
            )
            .map((project) => project.uid as string);
        children.forEach((childUid) => found.add(childUid));
        frontier = children;
    }
    return found;
}

export interface FoldedProjectRow<
    T extends Project = Project,
> extends ProjectTreeNode<T> {
    hasChildren: boolean;
    folded: boolean;
}

// Hides the sub-projects of folded projects (the sidebar's per-project fold).
// A fold on a project without sub-projects is ignored, and the ancestors of
// the open project stay unfolded so the open project is never hidden.
export function foldProjectTree<T extends Project>(
    nodes: ProjectTreeNode<T>[],
    folded: ReadonlySet<string>,
    openUid?: string
): FoldedProjectRow<T>[] {
    const keepOpen = new Set<string>();
    if (openUid) {
        const byUid = new Map(nodes.map((node) => [node.project.uid, node]));
        let parent = byUid.get(openUid)?.project.parent_project_uid;
        while (parent && byUid.has(parent) && !keepOpen.has(parent)) {
            keepOpen.add(parent);
            parent = byUid.get(parent)?.project.parent_project_uid;
        }
    }

    const rows: FoldedProjectRow<T>[] = [];
    let hiddenBelowDepth: number | null = null;
    nodes.forEach((node, index) => {
        if (hiddenBelowDepth !== null) {
            if (node.depth > hiddenBelowDepth) return;
            hiddenBelowDepth = null;
        }
        const hasChildren = (nodes[index + 1]?.depth ?? -1) > node.depth;
        const uid = node.project.uid ?? '';
        const isFolded = hasChildren && folded.has(uid) && !keepOpen.has(uid);
        rows.push({ ...node, hasChildren, folded: isFolded });
        if (isFolded) hiddenBelowDepth = node.depth;
    });
    return rows;
}

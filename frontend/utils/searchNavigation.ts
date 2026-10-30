// Where a search result leads, shared by the search overlay and the palette.

export interface SearchTarget {
    type: 'Task' | 'Project' | 'Area' | 'Note' | 'Tag' | 'Habit';
    uid?: string;
    name: string;
    title?: string;
}

export type SearchDestination =
    { kind: 'task'; uid: string } | { kind: 'path'; path: string } | null;

export const createSlug = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

export const searchDestination = (result: SearchTarget): SearchDestination => {
    if (!result.uid) return null;
    switch (result.type) {
        case 'Task':
            return { kind: 'task', uid: result.uid };
        case 'Project':
            return {
                kind: 'path',
                path: `/project/${result.uid}-${createSlug(result.name)}`,
            };
        case 'Area':
            return {
                kind: 'path',
                path: `/projects?area=${result.uid}-${createSlug(result.name)}`,
            };
        case 'Note': {
            const name = result.title || result.name;
            return name
                ? {
                      kind: 'path',
                      path: `/note/${result.uid}-${createSlug(name)}`,
                  }
                : null;
        }
        case 'Tag':
            return {
                kind: 'path',
                path: `/tag/${result.uid}-${createSlug(result.name)}`,
            };
        case 'Habit':
            return { kind: 'path', path: `/habit/${result.uid}` };
        default:
            return null;
    }
};

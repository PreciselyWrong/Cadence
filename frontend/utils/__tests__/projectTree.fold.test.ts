import { Project } from '../../entities/Project';
import { flattenProjectTree, foldProjectTree } from '../projectTree';

const project = (uid: string, parent?: string): Project =>
    ({
        uid,
        name: uid,
        status: 'in_progress',
        parent_project_uid: parent ?? null,
    }) as Project;

const tree = flattenProjectTree([
    project('home'),
    project('kitchen', 'home'),
    project('oven', 'kitchen'),
    project('garden'),
]);

const uids = (rows: ReturnType<typeof foldProjectTree>) =>
    rows.map((row) => row.project.uid);

describe('foldProjectTree', () => {
    it('marks the projects that have sub-projects', () => {
        const rows = foldProjectTree(tree, new Set());

        expect(uids(rows)).toEqual(['home', 'kitchen', 'oven', 'garden']);
        expect(rows.map((row) => row.hasChildren)).toEqual([
            true,
            true,
            false,
            false,
        ]);
        expect(rows.every((row) => !row.folded)).toBe(true);
    });

    it('hides every sub-project of a folded project, at any depth', () => {
        const rows = foldProjectTree(tree, new Set(['home']));

        expect(uids(rows)).toEqual(['home', 'garden']);
        expect(rows[0].folded).toBe(true);
    });

    it('keeps the open project visible inside a folded parent', () => {
        const rows = foldProjectTree(tree, new Set(['home']), 'oven');

        expect(uids(rows)).toEqual(['home', 'kitchen', 'oven', 'garden']);
        expect(rows[0].folded).toBe(false);
    });

    it('ignores a fold on a project without sub-projects', () => {
        const rows = foldProjectTree(tree, new Set(['garden']));

        expect(rows.find((row) => row.project.uid === 'garden')?.folded).toBe(
            false
        );
    });
});

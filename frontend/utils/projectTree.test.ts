import { descendantUids, flattenProjectTree } from './projectTree';
import { Project } from '../entities/Project';

const p = (
    uid: string,
    name: string,
    parent_project_uid: string | null = null
): Project => ({ uid, name, parent_project_uid });

const shape = (projects: Project[]) =>
    flattenProjectTree(projects).map((node) => [node.project.name, node.depth]);

describe('flattenProjectTree', () => {
    it('keeps top-level projects in their given order', () => {
        expect(shape([p('a', 'Alpha'), p('b', 'Beta')])).toEqual([
            ['Alpha', 0],
            ['Beta', 0],
        ]);
    });

    it('places each child right after its parent, indented one level', () => {
        const projects = [
            p('a', 'Alpha'),
            p('b', 'Beta'),
            p('a1', 'Alpha child', 'a'),
            p('a1x', 'Alpha grandchild', 'a1'),
        ];

        expect(shape(projects)).toEqual([
            ['Alpha', 0],
            ['Alpha child', 1],
            ['Alpha grandchild', 2],
            ['Beta', 0],
        ]);
    });

    it('shows a project whose parent is not in the list as a top-level item', () => {
        const projects = [p('x', 'Orphan', 'missing-parent'), p('a', 'Alpha')];

        expect(shape(projects)).toEqual([
            ['Orphan', 0],
            ['Alpha', 0],
        ]);
    });

    it('still shows projects that only point at each other', () => {
        const projects = [p('a', 'Alpha', 'b'), p('b', 'Beta', 'a')];

        const names = flattenProjectTree(projects).map((n) => n.project.name);
        expect(names.sort()).toEqual(['Alpha', 'Beta']);
    });

    it('lists every project below one project, at any depth', () => {
        const projects = [
            p('a', 'Alpha'),
            p('a1', 'Alpha child', 'a'),
            p('a1x', 'Alpha grandchild', 'a1'),
            p('b', 'Beta'),
        ];

        expect([...descendantUids(projects, 'a')].sort()).toEqual([
            'a1',
            'a1x',
        ]);
        expect(descendantUids(projects, 'b').size).toBe(0);
    });
});

describe('descendantUids', () => {
    it('stops at a loop in the data', () => {
        const projects = [p('a', 'Alpha', 'b'), p('b', 'Beta', 'a')];

        expect([...descendantUids(projects, 'a')]).toEqual(['b']);
    });
});

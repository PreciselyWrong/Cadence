import {
    buildPortfolioColumns,
    buildSubProjectColumns,
    buildTaskGroupColumns,
    canMoveTaskBetweenProjects,
    defaultBoardConfig,
    groupTasksBySourceSection,
    isOverWip,
    projectHealth,
} from '../boardModel';
import { BoardTreeSubProject, Project } from '../../../../entities/Project';
import { Task } from '../../../../entities/Task';

const makeSub = (
    overrides: Partial<BoardTreeSubProject> & { uid: string; name: string }
): BoardTreeSubProject => ({
    status: 'in_progress',
    open_tasks_count: 1,
    done_tasks_count: 0,
    total_tasks_count: 1,
    completion_percentage: 0,
    ...overrides,
});

const makeTask = (
    overrides: Partial<Task> & { uid: string; name: string }
): Task =>
    ({
        status: 0,
        ...overrides,
    }) as Task;

describe('boardModel', () => {
    it('builds default presets with sub-projects enabled when a parent has children', () => {
        const cfg = defaultBoardConfig(true);
        expect(cfg.includeSubProjects).toBe(true);
        expect(cfg.hideSubProjectsList).toBe(true);
        // Two views only: tasks by project, and the projects themselves.
        expect(cfg.presets.map((p) => [p.id, p.mode])).toEqual([
            ['active-projects', 'by_subproject'],
            ['portfolio', 'portfolio'],
        ]);
        expect(cfg.presets[0].projectStatuses).toEqual(['in_progress']);
        expect(cfg.presets[0].hideEmptyColumns).toBe(true);
        // No WIP alarm on the number of projects in progress.
        expect(cfg.presets[1].wipLimits).toEqual({});
        expect(cfg.presets[1].collapsedColumns).toEqual(['done']);
    });

    it('builds one column per active sub-project and respects hideEmptyColumns', () => {
        const parent: Project = {
            uid: 'dev',
            name: 'Dev',
            status: 'in_progress',
        };
        const subs = [
            makeSub({ uid: 'p1', name: 'Cadence', status: 'in_progress' }),
            makeSub({ uid: 'p2', name: 'PausedRepo', status: 'paused' }),
            makeSub({ uid: 'p3', name: 'EmptyActive', status: 'in_progress' }),
        ];
        const subTasks = [
            makeTask({ uid: 't1', name: 'Build board', project_uid: 'p1' }),
            makeTask({ uid: 't2', name: 'Sleeping task', project_uid: 'p2' }),
        ];

        const preset = {
            ...defaultBoardConfig(true).presets[0],
            hideEmptyColumns: false,
        };
        const cols = buildSubProjectColumns(
            parent,
            [],
            subs,
            subTasks,
            preset,
            ''
        );
        expect(cols.map((c) => c.projectUid)).toEqual(['dev', 'p1', 'p3']);
        expect(cols[1].tasks.map((t) => t.uid)).toEqual(['t1']);

        const compactCols = buildSubProjectColumns(
            parent,
            [],
            subs,
            subTasks,
            { ...preset, hideEmptyColumns: true },
            ''
        );
        expect(compactCols.map((c) => c.projectUid)).toEqual(['p1']);
    });

    it('builds portfolio columns by status with WIP alerts and collapsed columns', () => {
        const subs = [
            makeSub({ uid: 'p1', name: 'A', status: 'in_progress' }),
            makeSub({ uid: 'p2', name: 'B', status: 'in_progress' }),
            makeSub({ uid: 'p3', name: 'C', status: 'in_progress' }),
            makeSub({ uid: 'p4', name: 'D', status: 'in_progress' }),
            makeSub({ uid: 'p5', name: 'E', status: 'paused' }),
        ];
        const preset = {
            ...defaultBoardConfig(true).presets[1],
            wipLimits: { in_progress: 3 },
            collapsedColumns: ['paused', 'done'],
        };
        const cols = buildPortfolioColumns(subs, preset, '');
        const inProgress = cols.find((c) => c.id === 'in_progress')!;
        const paused = cols.find((c) => c.id === 'paused')!;

        expect(inProgress.projects).toHaveLength(4);
        expect(inProgress.isOverWip).toBe(true);
        expect(paused.projects).toHaveLength(1);
        expect(paused.collapsed).toBe(true);
    });

    it('groups tasks by status or tag and filters by recentDays', () => {
        const now = new Date('2026-11-26T10:00:00Z');
        const tasks = [
            makeTask({
                uid: 't1',
                name: 'Recent',
                status: 1,
                created_at: '2026-11-25T10:00:00Z',
                tags: [{ name: 'bug' }],
            }),
            makeTask({
                uid: 't2',
                name: 'Old',
                status: 0,
                created_at: '2026-10-01T10:00:00Z',
            }),
        ];
        const preset = {
            ...defaultBoardConfig(true).presets[0],
            mode: 'tasks' as const,
            projectStatuses: [],
            hideEmptyColumns: false,
            recentDays: 7,
        };
        const byStatus = buildTaskGroupColumns(
            tasks,
            [],
            preset,
            '',
            null,
            now
        );
        expect(
            byStatus
                .find((c) => c.id === 'in_progress')!
                .tasks.map((t) => t.uid)
        ).toEqual(['t1']);
        expect(
            byStatus.find((c) => c.id === 'not_started')!.tasks
        ).toHaveLength(0);

        const byTag = buildTaskGroupColumns(
            tasks,
            [],
            { ...preset, taskGroupBy: 'tag', recentDays: null },
            '',
            null,
            now
        );
        expect(
            byTag.find((c) => c.id === 'bug')!.tasks.map((t) => t.uid)
        ).toEqual(['t1']);
        expect(
            byTag.find((c) => c.id === '__untagged__')!.tasks.map((t) => t.uid)
        ).toEqual(['t2']);
    });

    it('blocks cross-project drag for TODO.md file-backed tasks', () => {
        expect(
            canMoveTaskBetweenProjects(makeTask({ uid: 't1', name: 'Normal' }))
        ).toBe(true);
        expect(
            canMoveTaskBetweenProjects(
                makeTask({ uid: 't2', name: 'File task', source_key: 'abc123' })
            )
        ).toBe(false);
        expect(isOverWip(4, 3)).toBe(true);
        expect(isOverWip(3, 3)).toBe(false);
    });

    it('rates a project blocked, stale or on track from its current state', () => {
        const now = new Date('2026-11-26T12:00:00Z');
        const fresh = '2026-11-20T12:00:00Z';
        expect(projectHealth(null, now, 14)).toBeNull();
        expect(
            projectHealth({ blockers: 'API down', updated_at: fresh }, now, 14)
        ).toBe('blocked');
        expect(
            projectHealth(
                { next_action: 'Ship', updated_at: '2026-11-01T12:00:00Z' },
                now,
                14
            )
        ).toBe('stale');
        expect(
            projectHealth({ next_action: 'Ship', updated_at: fresh }, now, 14)
        ).toBe('ok');
        // 0 turns the staleness check off.
        expect(
            projectHealth(
                { next_action: 'Ship', updated_at: '2026-01-01T12:00:00Z' },
                now,
                0
            )
        ).toBe('ok');
    });

    it('groups a column by TODO.md section, Now first and loose tasks last', () => {
        const groups = groupTasksBySourceSection([
            makeTask({ uid: 'a', name: 'Later', source_section: 'Next' }),
            makeTask({ uid: 'b', name: 'Loose' }),
            makeTask({ uid: 'c', name: 'Urgent', source_section: 'Now' }),
            makeTask({ uid: 'd', name: 'Custom', source_section: 'Bugs' }),
            makeTask({ uid: 'e', name: 'Later 2', source_section: 'next' }),
        ]);
        expect(groups.map((g) => [g.label, g.tasks.map((t) => t.uid)])).toEqual(
            [
                ['Now', ['c']],
                ['Next', ['a', 'e']],
                ['Bugs', ['d']],
                [null, ['b']],
            ]
        );
    });
});

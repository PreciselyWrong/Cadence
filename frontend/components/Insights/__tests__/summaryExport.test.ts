import {
    buildCsv,
    buildMarkdown,
    buildText,
    groupTasks,
    periodRange,
    SummaryTask,
} from '../summaryExport';

const task = (over: Partial<SummaryTask>): SummaryTask => ({
    uid: Math.random().toString(36).slice(2),
    name: 'Task',
    status: 'done',
    completed_at: '2026-02-10T15:00:00.000Z',
    completed_date: '2026-02-10',
    due_date: null,
    project: null,
    tags: [],
    ...over,
});

const labels = {
    noProject: 'No project',
    noDate: 'No date',
    status: (s: string) => s.toUpperCase(),
};

const tasks = [
    task({
        name: 'Write *docs*',
        project: { uid: 'p2', name: 'Zeta' },
        tags: ['work'],
    }),
    task({ name: 'Loose end', completed_date: '2026-02-09' }),
    task({ name: 'Plan', project: { uid: 'p1', name: 'Alpha' } }),
    task({
        name: 'Open one',
        status: 'not_started',
        completed_at: null,
        completed_date: null,
        due_date: '2026-02-11',
        project: { uid: 'p1', name: 'Alpha' },
    }),
];

describe('periodRange', () => {
    const wed = new Date(2026, 1, 11); // Wednesday 11 Feb 2026

    it('computes today, weeks and month', () => {
        expect(periodRange('today', wed)).toEqual({
            start: '2026-02-11',
            end: '2026-02-11',
        });
        expect(periodRange('this_week', wed, 1)).toEqual({
            start: '2026-02-09',
            end: '2026-02-15',
        });
        expect(periodRange('this_week', wed, 0)).toEqual({
            start: '2026-02-08',
            end: '2026-02-14',
        });
        expect(periodRange('last_week', wed, 1)).toEqual({
            start: '2026-02-02',
            end: '2026-02-08',
        });
        expect(periodRange('this_month', wed)).toEqual({
            start: '2026-02-01',
            end: '2026-02-28',
        });
    });
});

describe('groupTasks', () => {
    it('groups by project alphabetically with no project last', () => {
        const groups = groupTasks(tasks, 'project', labels);
        expect(groups.map((g) => g.label)).toEqual([
            'Alpha',
            'Zeta',
            'No project',
        ]);
        expect(groups[0].tasks.map((t) => t.name)).toEqual([
            'Plan',
            'Open one',
        ]);
    });

    it('groups by day using the completion day, else the due day', () => {
        const groups = groupTasks(tasks, 'day', labels);
        expect(groups.map((g) => g.key)).toEqual([
            '2026-02-09',
            '2026-02-10',
            '2026-02-11',
        ]);
    });

    it('groups by status in a fixed order', () => {
        const groups = groupTasks(tasks, 'status', labels);
        expect(groups.map((g) => g.label)).toEqual(['DONE', 'NOT_STARTED']);
    });
});

describe('exports', () => {
    const groups = groupTasks(tasks, 'project', labels);

    it('builds markdown with checkboxes, counts, tags and escaping', () => {
        expect(buildMarkdown('Summary', groups)).toBe(
            [
                '# Summary',
                '',
                '## Alpha (2)',
                '',
                '- [x] Plan',
                '- [ ] Open one',
                '',
                '## Zeta (1)',
                '',
                '- [x] Write \\*docs\\* #work',
                '',
                '## No project (1)',
                '',
                '- [x] Loose end',
                '',
            ].join('\n')
        );
    });

    it('builds plain text', () => {
        const text = buildText('Summary', groups);
        expect(
            text.startsWith('Summary\n=======\n\nAlpha (2)\n  [x] Plan\n')
        ).toBe(true);
        expect(text).toContain('  [x] Write *docs* #work');
    });

    it('builds csv with quoting and formula guard', () => {
        const csv = buildCsv(
            [task({ name: '=SUM(A1), "x"', tags: ['a', 'b'] })],
            {
                name: 'Task',
                status: 'Status',
                project: 'Project',
                completed: 'Completed',
                due: 'Due',
                tags: 'Tags',
            }
        );
        expect(csv).toBe(
            'Task,Status,Project,Completed,Due,Tags\r\n' +
                `"'=SUM(A1), ""x""",done,,2026-02-10,,"a, b"\r\n`
        );
    });
});

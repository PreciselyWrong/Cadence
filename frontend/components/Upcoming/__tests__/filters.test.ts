import { applyFilters, countActiveFilters, FilterableLine } from '../filters';
import { NO_FILTERS, PlanFilters } from '../viewOptions';

interface Line extends FilterableLine {
    id: string;
}

const lines: Line[] = [
    {
        id: 'work-high',
        task: {
            project_id: 1,
            tags: [{ name: 'urgent' }, { name: 'client' }],
            priority: 'high',
        },
    },
    {
        id: 'home-low',
        task: {
            project: { id: 2, uid: 'home-uid' },
            tags: [{ name: 'maison' }],
            priority: 'low',
        },
    },
    {
        id: 'no-project-numeric',
        task: { tags: [], priority: 2 },
    },
    {
        id: 'uid-only',
        task: { project_uid: 'work-uid', tags: null, priority: 'medium' },
    },
];

const ids = (result: Line[]) => result.map((line) => line.id);

const withFilters = (patch: Partial<PlanFilters>): PlanFilters => ({
    ...NO_FILTERS,
    ...patch,
});

describe('applyFilters', () => {
    it('returns every line when no facet is set', () => {
        expect(applyFilters(lines, NO_FILTERS)).toBe(lines);
    });

    it('matches a project by its id, as a string', () => {
        expect(
            ids(applyFilters(lines, withFilters({ projectIds: ['1'] })))
        ).toEqual(['work-high']);
    });

    it('matches a project through the nested project object or its uid', () => {
        expect(
            ids(applyFilters(lines, withFilters({ projectIds: ['2'] })))
        ).toEqual(['home-low']);
        expect(
            ids(applyFilters(lines, withFilters({ projectIds: ['home-uid'] })))
        ).toEqual(['home-low']);
        expect(
            ids(applyFilters(lines, withFilters({ projectIds: ['work-uid'] })))
        ).toEqual(['uid-only']);
    });

    it('matches a line when any of several projects is chosen', () => {
        expect(
            ids(applyFilters(lines, withFilters({ projectIds: ['1', '2'] })))
        ).toEqual(['work-high', 'home-low']);
    });

    it('matches a tag by its exact name', () => {
        expect(
            ids(applyFilters(lines, withFilters({ tagNames: ['client'] })))
        ).toEqual(['work-high']);
        expect(
            ids(applyFilters(lines, withFilters({ tagNames: ['Client'] })))
        ).toEqual([]);
    });

    it('matches a line that has any of several chosen tags', () => {
        expect(
            ids(
                applyFilters(
                    lines,
                    withFilters({ tagNames: ['maison', 'urgent'] })
                )
            )
        ).toEqual(['work-high', 'home-low']);
    });

    it('matches priorities by name, and a numeric priority by its level', () => {
        expect(
            ids(applyFilters(lines, withFilters({ priorities: ['medium'] })))
        ).toEqual(['uid-only']);
        // Numeric 2 is the high level (index into low, medium, high).
        expect(
            ids(applyFilters(lines, withFilters({ priorities: ['high'] })))
        ).toEqual(['work-high', 'no-project-numeric']);
        expect(
            ids(
                applyFilters(
                    lines,
                    withFilters({ priorities: ['low', 'high'] })
                )
            )
        ).toEqual(['work-high', 'home-low', 'no-project-numeric']);
    });

    it('excludes a line without a priority when priorities are chosen', () => {
        expect(
            ids(applyFilters(lines, withFilters({ priorities: ['low'] })))
        ).toEqual(['home-low']);
    });

    it('requires a match on every facet that is set', () => {
        const result = applyFilters(
            lines,
            withFilters({
                projectIds: ['1', '2'],
                tagNames: ['client'],
                priorities: ['high'],
            })
        );
        expect(ids(result)).toEqual(['work-high']);

        expect(
            ids(
                applyFilters(
                    lines,
                    withFilters({ projectIds: ['2'], priorities: ['high'] })
                )
            )
        ).toEqual([]);
    });

    it('keeps the extra fields of each line', () => {
        const rich = [{ id: 'x', start: 540, task: { priority: 'high' } }];
        expect(
            applyFilters(rich, withFilters({ priorities: ['high'] }))
        ).toEqual(rich);
    });
});

describe('countActiveFilters', () => {
    it('counts the chosen values across every facet', () => {
        expect(countActiveFilters(NO_FILTERS)).toBe(0);
        expect(
            countActiveFilters(
                withFilters({
                    projectIds: ['1', '2'],
                    tagNames: ['urgent'],
                    priorities: ['high'],
                })
            )
        ).toBe(4);
    });
});

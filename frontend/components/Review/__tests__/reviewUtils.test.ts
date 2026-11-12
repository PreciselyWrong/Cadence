import { groupLater } from '../reviewUtils';
import { TaskReviewItem } from '../../../utils/reviewService';
import { Task } from '../../../entities/Task';

const item = (
    uid: string,
    touched: string,
    extra: Partial<Task> = {},
    due = false
): TaskReviewItem => ({
    task: { uid, name: `Task ${uid}`, ...extra } as Task,
    review_due: due,
    last_activity_at: touched,
});

const items = [
    item('a', '2026-09-01T00:00:00Z', {
        Project: { uid: 'p1', name: 'House' } as Task['Project'],
    }),
    item('b', '2026-10-20T00:00:00Z', {
        Project: { uid: 'p2', name: 'Bike' } as Task['Project'],
    }),
    item('c', '2026-10-01T00:00:00Z', {
        Project: { uid: 'p1', name: 'House' } as Task['Project'],
        tags: [{ name: 'reading' }, { name: 'someday' }],
    }),
    item('d', '2026-10-30T00:00:00Z'),
    item('e', '2026-08-01T00:00:00Z', {
        Area: { uid: 'z1', name: 'Personal' } as Task['Area'],
    }),
];

describe('groupLater', () => {
    it('groups by project, then area, most recently touched first, no project last', () => {
        const groups = groupLater(items);
        expect(groups.map((g) => g.name)).toEqual([
            'Bike',
            'House',
            'Personal',
            null,
        ]);
        expect(groups[1].items.map((i) => i.task.uid)).toEqual(['c', 'a']);
    });

    it('puts a due review first in its group', () => {
        const due = items.map((i) =>
            i.task.uid === 'a' ? { ...i, review_due: true } : i
        );
        const house = groupLater(due).find((g) => g.name === 'House');
        expect(house?.items.map((i) => i.task.uid)).toEqual(['a', 'c']);
    });

    it('filters on title, group and tags, ignoring case and accents', () => {
        const uids = (query: string) =>
            groupLater(items, query)
                .flatMap((g) => g.items)
                .map((i) => i.task.uid);
        expect(uids('READING')).toEqual(['c']);
        expect(uids('house')).toEqual(['c', 'a']);
        expect(uids('persônal')).toEqual(['e']);
        expect(uids('nothing')).toEqual([]);
    });
});

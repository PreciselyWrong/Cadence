const {
    duplicateLineIds,
} = require('../../../migrations/20261115170000-one-planned-day-per-task');

describe('one planned day per task migration', () => {
    it('keeps the newest line of each task and drops the older ones', () => {
        const rows = [
            { id: 91, task_id: 381 },
            { id: 83, task_id: 381 },
            { id: 58, task_id: 381 },
            { id: 100, task_id: 80 },
            { id: 90, task_id: 80 },
            { id: 7, task_id: 5 },
        ];
        expect(duplicateLineIds(rows)).toEqual([83, 58, 90]);
    });

    it('drops nothing when every task has one line', () => {
        expect(duplicateLineIds([{ id: 1, task_id: 1 }])).toEqual([]);
    });
});

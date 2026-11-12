const {
    FILE_OWNED_TASK_FIELDS,
    statusCode,
    fileOwnedChanges,
    withoutFileOwned,
} = require('../../../../modules/todo-md/policy');

const task = {
    name: 'Ship it',
    note: 'with a note',
    status: 0,
    completed_at: null,
    project_id: 7,
};
const project = { id: 7, uid: 'projectuid0001' };

describe('todo-md field policy', () => {
    it('owns only the name, the note, the done box and the project', () => {
        expect(FILE_OWNED_TASK_FIELDS).toEqual(
            expect.arrayContaining([
                'name',
                'note',
                'status',
                'completed_at',
                'project_id',
                'project_uid',
            ])
        );
        expect(FILE_OWNED_TASK_FIELDS).not.toContain('priority');
        expect(FILE_OWNED_TASK_FIELDS).not.toContain('due_date');
        expect(FILE_OWNED_TASK_FIELDS).not.toContain('tags');
    });

    it('maps status names and numbers, and rejects unknown ones', () => {
        expect(statusCode('done')).toBe(2);
        expect(statusCode('completed')).toBe(2);
        expect(statusCode('in_progress')).toBe(1);
        expect(statusCode(2)).toBe(2);
        expect(statusCode('bogus')).toBeNull();
        expect(statusCode(9)).toBeNull();
    });

    it('lets app-side fields through untouched', () => {
        expect(
            fileOwnedChanges(task, project, {
                priority: 2,
                due_date: '2026-11-20',
                tag_uids: ['x'],
                today: true,
            })
        ).toEqual({ refused: [], status: null });
    });

    it('refuses a changed name or note', () => {
        expect(
            fileOwnedChanges(task, project, { name: 'Other' })
        ).toMatchObject({
            refused: ['name'],
        });
        expect(
            fileOwnedChanges(task, project, { note: 'edited' })
        ).toMatchObject({
            refused: ['note'],
        });
        expect(fileOwnedChanges(task, project, { note: null })).toMatchObject({
            refused: ['note'],
        });
    });

    it('ignores a name, note or project sent with the value it already has', () => {
        expect(
            fileOwnedChanges(task, project, {
                name: 'Ship it',
                note: 'with a note',
                project_uid: 'projectuid0001',
                project_id: 7,
            })
        ).toEqual({ refused: [], status: null });
        expect(
            fileOwnedChanges({ ...task, note: null }, project, { note: '' })
        ).toEqual({ refused: [], status: null });
    });

    it('refuses moving the task to another project, by uid or id', () => {
        expect(
            fileOwnedChanges(task, project, { project_uid: 'otheruid0001' })
        ).toMatchObject({ refused: ['project_uid'] });
        expect(
            fileOwnedChanges(task, project, { project_id: 8 })
        ).toMatchObject({
            refused: ['project_id'],
        });
    });

    it('asks for a box write when the status changes, and not when it does not', () => {
        expect(fileOwnedChanges(task, project, { status: 2 })).toEqual({
            refused: [],
            status: 2,
        });
        expect(
            fileOwnedChanges(task, project, { status: 'in_progress' })
        ).toEqual({ refused: [], status: 1 });
        expect(fileOwnedChanges(task, project, { status: 0 })).toEqual({
            refused: [],
            status: null,
        });
    });

    it('refuses a status it cannot map', () => {
        expect(
            fileOwnedChanges(task, project, { status: 'bogus' })
        ).toMatchObject({ refused: ['status'] });
    });

    it('treats completed_at as derived from the box: ignored with a status change, refused alone', () => {
        expect(
            fileOwnedChanges(task, project, {
                status: 2,
                completed_at: '2026-10-30T10:00:00.000Z',
            })
        ).toEqual({ refused: [], status: 2 });
        expect(
            fileOwnedChanges(task, project, {
                completed_at: '2026-10-30T10:00:00.000Z',
            })
        ).toMatchObject({ refused: ['completed_at'] });
        expect(
            fileOwnedChanges(
                {
                    ...task,
                    status: 2,
                    completed_at: new Date('2026-10-30T10:00:00.000Z'),
                },
                project,
                { completed_at: '2026-10-30T10:00:00.000Z' }
            )
        ).toEqual({ refused: [], status: null });
    });

    it('drops the file-owned fields and keeps the rest', () => {
        expect(
            withoutFileOwned({
                name: 'x',
                status: 2,
                completed_at: 'y',
                project_uid: 'z',
                priority: 1,
            })
        ).toEqual({ priority: 1 });
    });
});

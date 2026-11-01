import { duplicateTask } from '../tasksService';
import { Task } from '../../entities/Task';

jest.mock('../authUtils', () => ({
    handleAuthResponse: jest.fn(async () => undefined),
    getDefaultHeaders: () => ({}),
    getPostHeadersWithCsrf: async () => ({}),
}));

const jsonResponse = (body: unknown) =>
    ({
        ok: true,
        status: 200,
        json: async () => body,
    }) as Response;

const source = {
    id: 5,
    uid: 'source-uid-00001',
    name: 'Write report',
    note: 'Use the Q3 template',
    status: 'in_progress',
    priority: 'high',
    project_id: 2,
    project_uid: 'project-uid-0002',
    area_id: 3,
    area_uid: 'area-uid-000003',
    tags: [{ id: 9, uid: 'tag-uid-000009', name: 'work' }],
    due_date: '2026-11-10',
    due_time: '09:30',
    due_has_time: true,
    start_date: '2026-11-08',
    start_time: null,
    defer_until: '2026-11-07',
    recurrence_type: 'weekly',
    recurring_parent_id: 4,
    parent_task_id: 1,
    subtasks: [{ id: 6, uid: 'sub', name: 'Outline' }],
    completed_at: null,
    created_at: '2026-10-01T00:00:00Z',
} as unknown as Task;

describe('duplicateTask', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('creates a new task with the name, note, project, area, tags, priority and dates', async () => {
        const fetchMock = jest.fn().mockResolvedValue(
            jsonResponse({
                id: 50,
                uid: 'copy-uid-000050',
                name: 'Write report',
            })
        );
        global.fetch = fetchMock as unknown as typeof fetch;

        const copy = await duplicateTask(source);

        expect(copy.uid).toBe('copy-uid-000050');
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toMatch(/\/task$/);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({
            name: 'Write report',
            note: 'Use the Q3 template',
            priority: 'high',
            project_id: 2,
            area_id: 3,
            tags: [{ name: 'work' }],
            due_date: '2026-11-10',
            due_time: '09:30',
            due_has_time: true,
            start_date: '2026-11-08',
            start_time: null,
            defer_until: '2026-11-07',
        });
    });

    it('leaves out identity, status, subtasks, recurrence and parent links', async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValue(jsonResponse({ uid: 'copy-uid-000051' }));
        global.fetch = fetchMock as unknown as typeof fetch;

        await duplicateTask(source);

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        for (const key of [
            'id',
            'uid',
            'status',
            'subtasks',
            'completed_at',
            'created_at',
            'recurrence_type',
            'recurring_parent_id',
            'parent_task_id',
        ]) {
            expect(body).not.toHaveProperty(key);
        }
    });
});

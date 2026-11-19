import { taskMenuEntries, TaskMenuHandlers } from '../taskMenuEntries';
import type { MenuEntry, MenuItem } from '../../../Shared/ui/Menu';
import type { Task } from '../../../../entities/Task';
import type { Project } from '../../../../entities/Project';

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

const handlers = (): TaskMenuHandlers => ({
    open: jest.fn(),
    toggle: jest.fn(),
    setDue: jest.fn(),
    pickDate: jest.fn(),
    setPriority: jest.fn(),
    moveTo: jest.fn(),
    setPinned: jest.fn(),
    duplicate: jest.fn(),
    copyLink: jest.fn(),
    copyTitle: jest.fn(),
    turnIntoProject: jest.fn(),
    remove: jest.fn(),
});

const task = (over: Partial<Task> = {}): Task =>
    ({
        id: 1,
        uid: 'u1',
        name: 'Écrire le rapport',
        status: 'not_started',
        priority: null,
        project_id: null,
        ...over,
    }) as Task;

const projects = [
    { id: 2, uid: 'p2', name: 'Zèbre' },
    { id: 3, uid: 'p3', name: 'Alpha' },
    { id: 4, uid: 'p4', name: 'Fini', status: 'done' },
] as unknown as Project[];

const build = (over: Partial<Task> = {}, extra = {}) => {
    const h = handlers();
    const entries = taskMenuEntries({
        task: task(over),
        projects,
        handlers: h,
        today: '2026-11-19',
        tomorrow: '2026-11-20',
        nextWeek: '2026-11-23',
        t,
        ...extra,
    });
    return { h, entries };
};

const items = (entries: MenuEntry[]): MenuItem[] =>
    entries.filter(
        (entry): entry is MenuItem =>
            typeof entry === 'object' && 'key' in entry
    );
const item = (entries: MenuEntry[], key: string): MenuItem => {
    const found = items(entries).find((entry) => entry.key === key);
    if (!found) throw new Error(`no ${key}`);
    return found;
};

describe('taskMenuEntries', () => {
    it('offers the same actions for any task, delete last', () => {
        const { entries } = build();
        expect(items(entries).map((entry) => entry.key)).toEqual([
            'open',
            'toggle',
            'date',
            'priority',
            'project',
            'pin',
            'duplicate',
            'turnIntoProject',
            'copyLink',
            'copyTitle',
            'delete',
        ]);
        expect(item(entries, 'delete').danger).toBe(true);
    });

    it('says Reopen for a finished task', () => {
        const { entries } = build({ status: 'done' });
        expect(item(entries, 'toggle').label).toBe('Reopen');
    });

    it('puts the page actions first, then a separator', () => {
        const lead: MenuEntry[] = [{ key: 'plan', label: 'Caser' }];
        const { entries } = build({}, { lead });
        expect(entries[0]).toBe(lead[0]);
        expect(entries[1]).toBe('separator');
    });

    it('sets the date from its submenu and clears it only when set', () => {
        const { h, entries } = build();
        const dates = item(entries, 'date').submenu ?? [];
        expect(items(dates).map((entry) => entry.key)).toEqual([
            'today',
            'tomorrow',
            'nextWeek',
            'pick',
        ]);
        item(dates, 'nextWeek').onSelect?.();
        expect(h.setDue).toHaveBeenCalledWith('2026-11-23');
        item(dates, 'pick').onSelect?.();
        expect(h.pickDate).toHaveBeenCalled();

        const dated = build({ due_date: '2026-11-20' });
        const datedMenu = item(dated.entries, 'date').submenu ?? [];
        expect(item(datedMenu, 'tomorrow').checked).toBe(true);
        item(datedMenu, 'clear').onSelect?.();
        expect(dated.h.setDue).toHaveBeenCalledWith(null);
    });

    it('marks the current priority and sets another', () => {
        const { h, entries } = build({ priority: 'medium' });
        const priorities = item(entries, 'priority').submenu ?? [];
        expect(item(priorities, 'priority-medium').checked).toBe(true);
        item(priorities, 'priority-high').onSelect?.();
        expect(h.setPriority).toHaveBeenCalledWith('high');
    });

    it('lists open projects by name and leaves finished ones out', () => {
        const { h, entries } = build({ project_id: 2 });
        const list = item(entries, 'project').submenu ?? [];
        expect(items(list).map((entry) => entry.label)).toEqual([
            'No project',
            'Alpha',
            'Zèbre',
        ]);
        expect(item(list, 'project-p2').checked).toBe(true);
        item(list, 'project-none').onSelect?.();
        expect(h.moveTo).toHaveBeenCalledWith(null);
    });

    it('keeps a TODO.md task in its file: no project, copy or delete', () => {
        const { entries } = build({
            source_key: 'todo-md:abc',
        } as Partial<Task>);
        const keys = items(entries).map((entry) => entry.key);
        expect(keys).not.toContain('project');
        expect(keys).not.toContain('duplicate');
        expect(keys).not.toContain('delete');
        expect(keys).toContain('toggle');
    });
});

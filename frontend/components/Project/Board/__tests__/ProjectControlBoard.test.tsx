import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectControlBoard from '../ProjectControlBoard';
import { defaultBoardConfig } from '../boardModel';
import { Project } from '../../../../entities/Project';
import { Task } from '../../../../entities/Task';

// The task check circle reads its labels through the hook.
jest.mock('react-i18next', () => ({
    // dateUtils loads the app's i18n instance, which registers this plugin.
    initReactI18next: { type: '3rdParty', init: () => undefined },
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));

jest.mock('../../../../utils/projectsService', () => ({
    fetchProjectBoardTree: jest.fn(),
    updateProject: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../../utils/tasksService', () => ({
    fetchTasks: jest.fn().mockResolvedValue({ tasks: [] }),
    createTask: jest.fn(),
    updateTask: jest.fn().mockResolvedValue({}),
    toggleTaskCompletion: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../../utils/inboxService', () => ({
    fetchInboxItems: jest.fn().mockResolvedValue([]),
    createInboxItem: jest.fn(),
    processInboxItem: jest.fn(),
}));

jest.mock('../../../../utils/todoMdService', () => ({
    rescanTodoMd: jest.fn(),
}));

import { rescanTodoMd } from '../../../../utils/todoMdService';
import { fetchProjectBoardTree } from '../../../../utils/projectsService';
import { fetchInboxItems } from '../../../../utils/inboxService';

const t = ((_k: string, def?: string) => def || _k) as any;

const devProject: Project = {
    uid: 'dev',
    name: 'Dev',
    status: 'in_progress',
    SubProjects: [
        {
            uid: 'p1',
            name: 'Cadence',
            status: 'in_progress',
            open_tasks_count: 1,
        },
        { uid: 'p2', name: 'Memo', status: 'paused', open_tasks_count: 1 },
    ],
};

const mockTree = {
    sub_projects: [
        {
            uid: 'p1',
            name: 'Cadence',
            status: 'in_progress',
            source_type: 'todo_md',
            handoff_state: {
                section: 'État actuel',
                branch: 'feat/kanban',
                tree: 'modifications non commitées',
                updated_at: '2020-01-01T00:00:00Z',
                blockers: null,
                next_action: 'Ship phase 2 board',
            },
            open_tasks_count: 1,
            done_tasks_count: 1,
            total_tasks_count: 2,
            completion_percentage: 50,
            tags: [{ name: 'web' }],
        },
        {
            uid: 'p2',
            name: 'Memo',
            status: 'paused',
            open_tasks_count: 1,
            done_tasks_count: 0,
            total_tasks_count: 1,
            completion_percentage: 0,
            tags: [],
        },
    ],
    tasks: [
        {
            uid: 't1',
            name: 'Wire control board',
            status: 0,
            project_uid: 'p1',
            source_section: 'Next',
        } as Task,
        ...Array.from(
            { length: 10 },
            (_, i) =>
                ({
                    uid: `n${i}`,
                    name: `Now task ${i}`,
                    status: 0,
                    project_uid: 'p1',
                    source_section: 'Now',
                }) as Task
        ),
        {
            uid: 't2',
            name: 'Paused task',
            status: 0,
            project_uid: 'p2',
        } as Task,
    ],
};

describe('ProjectControlBoard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchProjectBoardTree as jest.Mock).mockResolvedValue(mockTree);
        (fetchInboxItems as jest.Mock).mockResolvedValue([
            { uid: 'in1', content: 'Mobile idea', status: 'added' },
        ]);
    });

    it('shows one column per active sub-project with handoff state and switches to portfolio drawer', async () => {
        const Wrapper: React.FC = () => {
            const [config, setConfig] = React.useState(() =>
                defaultBoardConfig(true)
            );
            return (
                <MemoryRouter>
                    <ProjectControlBoard
                        project={devProject}
                        tasks={[]}
                        config={config}
                        onChangeConfig={setConfig}
                        onMoveTaskSection={jest.fn()}
                        onOpenTask={jest.fn()}
                        t={t}
                    />
                </MemoryRouter>
            );
        };

        render(<Wrapper />);

        await waitFor(() => {
            expect(screen.getByTestId('subproject-col-p1')).toBeInTheDocument();
        });
        expect(screen.getByText('→ Ship phase 2 board')).toBeInTheDocument();
        // A column keeps the next action only; the rest is in its tooltip.
        expect(screen.queryByText('feat/kanban')).not.toBeInTheDocument();
        expect(
            screen.getByTestId('handoff-compact').getAttribute('title')
        ).toContain('feat/kanban');
        expect(screen.getByText('Wire control board')).toBeInTheDocument();
        // Health from the current state: not refreshed since 2020, so stale.
        expect(screen.getByTestId('health-p1')).toHaveAttribute(
            'data-health',
            'stale'
        );
        expect(screen.getByTestId('handoff-stale')).toBeInTheDocument();
        // Sections of the file, Now first, folded past eight cards.
        const sections = screen
            .getAllByTestId(/^board-section-/)
            .map((el) => el.getAttribute('data-testid'));
        expect(sections).toEqual(['board-section-now', 'board-section-next']);
        expect(screen.queryByText('Now task 9')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Show {{count}} more'));
        expect(screen.getByText('Now task 9')).toBeInTheDocument();
        // Paused sub-project is filtered out of the default Actifs preset.
        expect(
            screen.queryByTestId('subproject-col-p2')
        ).not.toBeInTheDocument();

        // Switch to Portfolio preset and inspect Cadence in the drawer.
        fireEvent.click(screen.getByTestId('board-preset-portfolio'));
        expect(screen.getByTestId('portfolio-card-p1')).toBeInTheDocument();
        expect(screen.getByText('feat/kanban')).toBeInTheDocument();
        expect(
            screen.getByText('modifications non commitées')
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('peek-project-p1'));
        expect(screen.getByTestId('subproject-drawer')).toBeInTheDocument();
        expect(screen.getByTestId('drawer-handoff')).toHaveTextContent(
            'Ship phase 2 board'
        );
    });

    it('toggles the Captures inbox column on the left', async () => {
        const Wrapper: React.FC = () => {
            const [config, setConfig] = React.useState(() =>
                defaultBoardConfig(true)
            );
            return (
                <MemoryRouter>
                    <ProjectControlBoard
                        project={devProject}
                        tasks={[]}
                        config={config}
                        onChangeConfig={setConfig}
                        onMoveTaskSection={jest.fn()}
                        onOpenTask={jest.fn()}
                        t={t}
                    />
                </MemoryRouter>
            );
        };

        render(<Wrapper />);
        fireEvent.click(screen.getByTestId('toggle-captures-column'));

        await waitFor(() => {
            expect(
                screen.getByTestId('board-inbox-column')
            ).toBeInTheDocument();
            expect(screen.getByText('Mobile idea')).toBeInTheDocument();
        });
    });

    it('rereads every TODO.md file, then reloads the sub-projects', async () => {
        (rescanTodoMd as jest.Mock).mockResolvedValue({
            projects: 2,
            created: 1,
            updated: 0,
            removed: 0,
            errors: [],
        });
        const onReloadParent = jest.fn();
        render(
            <MemoryRouter>
                <ProjectControlBoard
                    project={devProject}
                    tasks={[]}
                    config={defaultBoardConfig(true)}
                    onChangeConfig={jest.fn()}
                    onMoveTaskSection={jest.fn()}
                    onOpenTask={jest.fn()}
                    onReloadParent={onReloadParent}
                    t={t}
                />
            </MemoryRouter>
        );

        const button = await screen.findByTestId('board-refresh-todo-md');
        const loads = (fetchProjectBoardTree as jest.Mock).mock.calls.length;
        fireEvent.click(button);

        await waitFor(() => {
            expect(rescanTodoMd).toHaveBeenCalledTimes(1);
            expect(
                (fetchProjectBoardTree as jest.Mock).mock.calls.length
            ).toBeGreaterThan(loads);
            expect(onReloadParent).toHaveBeenCalledTimes(1);
        });
    });

    it('offers no TODO.md refresh when no sub-project follows a file', async () => {
        (fetchProjectBoardTree as jest.Mock).mockResolvedValue({
            ...mockTree,
            sub_projects: mockTree.sub_projects.map((p) => ({
                ...p,
                source_type: null,
            })),
        });
        render(
            <MemoryRouter>
                <ProjectControlBoard
                    project={devProject}
                    tasks={[]}
                    config={defaultBoardConfig(true)}
                    onChangeConfig={jest.fn()}
                    onMoveTaskSection={jest.fn()}
                    onOpenTask={jest.fn()}
                    t={t}
                />
            </MemoryRouter>
        );
        await screen.findByTestId('subproject-col-p1');
        expect(
            screen.queryByTestId('board-refresh-todo-md')
        ).not.toBeInTheDocument();
    });

    it('names a new view inline, without a browser prompt', async () => {
        const prompt = jest.spyOn(window, 'prompt');
        const Wrapper: React.FC = () => {
            const [config, setConfig] = React.useState(() =>
                defaultBoardConfig(true)
            );
            return (
                <MemoryRouter>
                    <ProjectControlBoard
                        project={devProject}
                        tasks={[]}
                        config={config}
                        onChangeConfig={setConfig}
                        onMoveTaskSection={jest.fn()}
                        onOpenTask={jest.fn()}
                        t={t}
                    />
                </MemoryRouter>
            );
        };
        render(<Wrapper />);

        fireEvent.click(screen.getByTestId('board-new-view'));
        const input = screen.getByTestId('board-new-view-name');
        fireEvent.change(input, { target: { value: 'Urgent' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        expect(prompt).not.toHaveBeenCalled();
        expect(
            await screen.findByRole('button', { name: 'Urgent' })
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId('board-new-view-name')
        ).not.toBeInTheDocument();
        prompt.mockRestore();
    });

    it('opens a task from a click anywhere on its card, not from its check box', async () => {
        const onOpenTask = jest.fn();
        render(
            <MemoryRouter>
                <ProjectControlBoard
                    project={devProject}
                    tasks={[]}
                    config={defaultBoardConfig(true)}
                    onChangeConfig={jest.fn()}
                    onMoveTaskSection={jest.fn()}
                    onOpenTask={onOpenTask}
                    t={t}
                />
            </MemoryRouter>
        );
        const card = await screen.findByTestId('control-card-t1');
        fireEvent.click(card);
        expect(onOpenTask).toHaveBeenCalledTimes(1);
        expect(onOpenTask.mock.calls[0][0].uid).toBe('t1');

        // The round check every Cadence task uses, not a native box.
        expect(card.querySelector('input[type="checkbox"]')).toBeNull();
        fireEvent.click(
            card.querySelector('[data-testid="task-check-circle"]') as Element
        );
        expect(onOpenTask).toHaveBeenCalledTimes(1);
    });

    it('keeps the toolbar to the views: board type and the 7-day filter sit in Display', async () => {
        const Wrapper: React.FC = () => {
            const [config, setConfig] = React.useState(() =>
                defaultBoardConfig(true)
            );
            return (
                <MemoryRouter>
                    <ProjectControlBoard
                        project={devProject}
                        tasks={[]}
                        config={config}
                        onChangeConfig={setConfig}
                        onMoveTaskSection={jest.fn()}
                        onOpenTask={jest.fn()}
                        t={t}
                    />
                </MemoryRouter>
            );
        };
        render(<Wrapper />);
        await screen.findByTestId('subproject-col-p1');

        expect(
            screen.queryByTestId('board-mode-select')
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId('board-recent-chip')
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('board-display-button'));
        expect(screen.getByTestId('board-mode-select')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('board-recent-toggle'));

        // An active filter stays visible in the toolbar, one click clears it.
        fireEvent.click(screen.getByTestId('board-recent-chip'));
        expect(
            screen.queryByTestId('board-recent-chip')
        ).not.toBeInTheDocument();
    });

    it('shows no health dot on a project that is on track', async () => {
        (fetchProjectBoardTree as jest.Mock).mockResolvedValue({
            ...mockTree,
            sub_projects: mockTree.sub_projects.map((p) =>
                p.handoff_state
                    ? {
                          ...p,
                          handoff_state: {
                              ...p.handoff_state,
                              updated_at: new Date().toISOString(),
                          },
                      }
                    : p
            ),
        });
        render(
            <MemoryRouter>
                <ProjectControlBoard
                    project={devProject}
                    tasks={[]}
                    config={defaultBoardConfig(true)}
                    onChangeConfig={jest.fn()}
                    onMoveTaskSection={jest.fn()}
                    onOpenTask={jest.fn()}
                    t={t}
                />
            </MemoryRouter>
        );
        await screen.findByTestId('subproject-col-p1');
        expect(screen.queryByTestId('health-p1')).not.toBeInTheDocument();
    });

    it('labels statuses and card fields from the translations, not in English', async () => {
        // Resolves keys in the French file, like the app does.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fr = require('../../../../../public/locales/fr/translation.json');
        const lookup = (key: string) =>
            key
                .split('.')
                .reduce(
                    (node: any, part) =>
                        node && typeof node === 'object'
                            ? node[part]
                            : undefined,
                    fr
                );
        const tFr = ((key: string, def?: string) => {
            const value = lookup(key);
            return typeof value === 'string' ? value : def || key;
        }) as any;
        const Wrapper: React.FC = () => {
            const [config, setConfig] = React.useState(() =>
                defaultBoardConfig(true)
            );
            return (
                <MemoryRouter>
                    <ProjectControlBoard
                        project={devProject}
                        tasks={[]}
                        config={config}
                        onChangeConfig={setConfig}
                        onMoveTaskSection={jest.fn()}
                        onOpenTask={jest.fn()}
                        t={tFr}
                    />
                </MemoryRouter>
            );
        };
        render(<Wrapper />);
        await screen.findByTestId('subproject-col-p1');

        fireEvent.click(screen.getByTestId('board-preset-portfolio'));
        expect(
            screen.getByTestId('portfolio-col-in_progress')
        ).toHaveTextContent('En cours');
        expect(screen.getByTestId('portfolio-col-paused')).toHaveTextContent(
            'En pause'
        );

        fireEvent.click(screen.getByTestId('board-display-button'));
        const menu = screen.getByTestId('board-display-menu');
        for (const english of [
            'In progress',
            'Not started',
            'Handoff',
            'Next action',
            'Due date',
        ]) {
            expect(menu).not.toHaveTextContent(english);
        }
    });
});

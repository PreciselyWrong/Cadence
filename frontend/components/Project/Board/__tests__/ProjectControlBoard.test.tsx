import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectControlBoard from '../ProjectControlBoard';
import { defaultBoardConfig } from '../boardModel';
import { Project } from '../../../../entities/Project';
import { Task } from '../../../../entities/Task';

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
        expect(screen.getByText('feat/kanban')).toBeInTheDocument();
        expect(
            screen.getByText('modifications non commitées')
        ).toBeInTheDocument();
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
});

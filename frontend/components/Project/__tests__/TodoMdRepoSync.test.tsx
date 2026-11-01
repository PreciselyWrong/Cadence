import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoMdRepoSync from '../TodoMdRepoSync';
import {
    fetchTodoMdStatus,
    retryTodoMdRepo,
    discardTodoMdRepo,
    TodoMdRepoStatus,
} from '../../../utils/todoMdService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            const text = typeof fallback === 'string' ? fallback : key;
            return text.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
                String(options?.[name] ?? '')
            );
        },
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));

jest.mock('../../../utils/todoMdService', () => ({
    fetchTodoMdStatus: jest.fn(),
    retryTodoMdRepo: jest.fn(),
    discardTodoMdRepo: jest.fn(),
}));

const repo = (extra: Partial<TodoMdRepoStatus> = {}): TodoMdRepoStatus => ({
    slug: 'demo',
    repo: 'gitea.lan/nico/demo',
    branch: 'main',
    path: 'TODO.md',
    project_uid: 'p1',
    webhook: true,
    head_sha: 'abc',
    synced_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    last_error: null,
    pending: [],
    ...extra,
});

describe('TodoMdRepoSync', () => {
    it('says when the project was last synced', async () => {
        (fetchTodoMdStatus as jest.Mock).mockResolvedValue({
            enabled: true,
            repos: [repo()],
        });

        render(<TodoMdRepoSync slug="demo" />);

        expect(
            await screen.findByText(
                'Synced with gitea.lan/nico/demo · 3 minutes ago'
            )
        ).toBeInTheDocument();
        expect(screen.queryByTestId('todo-md-repo-retry')).toBeNull();
    });

    it('shows a conflict and retries or discards it', async () => {
        const pending = [
            {
                id: '1',
                op: 'done' as const,
                name: 'Fix bug',
                done: true,
                reason: 'conflict' as const,
                error: 'x',
                at: '',
            },
        ];
        (fetchTodoMdStatus as jest.Mock).mockResolvedValue({
            enabled: true,
            repos: [repo({ pending })],
        });
        (retryTodoMdRepo as jest.Mock).mockResolvedValue(repo({ pending }));
        (discardTodoMdRepo as jest.Mock).mockResolvedValue(repo());
        const onChanged = jest.fn();

        render(<TodoMdRepoSync slug="demo" onChanged={onChanged} />);

        expect(
            await screen.findByText(
                'Conflict: "Fix bug" changed in the repository, nothing was written.'
            )
        ).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('todo-md-repo-retry'));
        await waitFor(() =>
            expect(retryTodoMdRepo).toHaveBeenCalledWith('demo')
        );

        fireEvent.click(screen.getByTestId('todo-md-repo-discard'));
        await waitFor(() =>
            expect(discardTodoMdRepo).toHaveBeenCalledWith('demo')
        );
        expect(await screen.findByText(/Synced with/)).toBeInTheDocument();
        expect(onChanged).toHaveBeenCalledTimes(2);
    });

    it('shows nothing to an account that does not see the repositories', async () => {
        (fetchTodoMdStatus as jest.Mock).mockResolvedValue({
            enabled: true,
            repos: [],
        });

        const { container } = render(<TodoMdRepoSync slug="demo" />);

        await waitFor(() => expect(fetchTodoMdStatus).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});

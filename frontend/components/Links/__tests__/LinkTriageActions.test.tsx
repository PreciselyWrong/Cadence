import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LinkTriageActions from '../LinkTriageActions';
import { Link } from '../../../entities/Link';
import { InboxItem } from '../../../entities/InboxItem';
import { Project } from '../../../entities/Project';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
                String(options?.[name] ?? `{{${name}}}`)
            ),
        i18n: { language: 'en' },
    }),
}));

const mockSave = jest.fn();
const mockProcess = jest.fn();
const mockCreateTask = jest.fn();
const mockError = jest.fn();

jest.mock('../../../store/linksStore', () => ({
    useLinksStore: (selector: (s: unknown) => unknown) =>
        selector({ save: (...args: unknown[]) => mockSave(...args) }),
}));
jest.mock('../../../utils/inboxService', () => ({
    processInboxItemWithStore: (...args: unknown[]) => mockProcess(...args),
}));
jest.mock('../../../utils/tasksService', () => ({
    createTask: (...args: unknown[]) => mockCreateTask(...args),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: (...args: unknown[]) => mockError(...args),
        showUndoToast: jest.fn(),
    }),
}));

const link: Link = {
    uid: 'l1',
    url: 'https://github.com/owner/tool',
    domain: 'github.com',
    title: 'owner/tool',
    description: null,
    image_url: null,
    site_name: null,
    kind: 'repo',
    github_stars: null,
    github_language: null,
    github_last_commit: null,
    readme_excerpt: null,
    note: 'compare with jq',
    status: 'new',
    review_at: null,
    tags: [],
    source_type: 'inbox_item',
    source_uid: 'i1',
    fetch_status: 'done',
    fetched_at: null,
    created_at: '2026-10-02T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
};

const item = {
    uid: 'i1',
    content: 'https://github.com/owner/tool',
} as InboxItem;

const projects = [{ uid: 'p1', name: 'Tooling' }] as Project[];

const renderActions = () =>
    render(<LinkTriageActions item={item} link={link} projects={projects} />);

describe('LinkTriageActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSave.mockResolvedValue({});
        mockProcess.mockResolvedValue({});
        mockCreateTask.mockResolvedValue({
            uid: 't1',
            name: 'Try: owner/tool',
        });
    });

    it('offers Keep, Try, Attach, Later and Drop', () => {
        renderActions();

        for (const label of ['Keep', 'Try', 'Attach', 'Later', 'Drop']) {
            expect(
                screen.getByRole('button', { name: label })
            ).toBeInTheDocument();
        }
    });

    it('Keep keeps the link and marks the item processed', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

        await waitFor(() => expect(mockProcess).toHaveBeenCalledWith('i1'));
        expect(mockSave).toHaveBeenCalledWith('l1', { status: 'kept' });
    });

    it('Later parks the link and marks the item processed', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Later' }));

        await waitFor(() => expect(mockProcess).toHaveBeenCalledWith('i1'));
        expect(mockSave).toHaveBeenCalledWith('l1', { status: 'parked' });
    });

    it('Drop drops the link and marks the item processed', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Drop' }));

        await waitFor(() => expect(mockProcess).toHaveBeenCalledWith('i1'));
        expect(mockSave).toHaveBeenCalledWith('l1', { status: 'dropped' });
    });

    it('Try creates the task in the chosen project, with the address and the note', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Try' }));
        fireEvent.change(screen.getByLabelText('Project'), {
            target: { value: 'p1' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

        await waitFor(() =>
            expect(mockCreateTask).toHaveBeenCalledWith({
                name: 'Try: owner/tool',
                note: 'https://github.com/owner/tool\n\ncompare with jq',
                project_uid: 'p1',
            })
        );
        expect(mockSave).toHaveBeenCalledWith('l1', { status: 'tested' });
        expect(mockProcess).toHaveBeenCalledWith('i1', { task_uid: 't1' });
    });

    it('Try without a project creates the task with none', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Try' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

        await waitFor(() =>
            expect(mockCreateTask).toHaveBeenCalledWith(
                expect.objectContaining({ project_uid: undefined })
            )
        );
    });

    it('Attach creates a task named after the link in the chosen project and keeps the link', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
        expect(screen.queryByRole('option', { name: 'No project' })).toBeNull();
        const create = screen.getByRole('button', { name: 'Create task' });
        expect(create).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Project'), {
            target: { value: 'p1' },
        });
        fireEvent.click(create);

        await waitFor(() =>
            expect(mockCreateTask).toHaveBeenCalledWith({
                name: 'owner/tool',
                note: 'https://github.com/owner/tool\n\ncompare with jq',
                project_uid: 'p1',
            })
        );
        expect(mockSave).toHaveBeenCalledWith('l1', { status: 'kept' });
        expect(mockProcess).toHaveBeenCalledWith('i1', { task_uid: 't1' });
    });

    it('reports a failed decision and leaves the item in the inbox', async () => {
        mockSave.mockRejectedValueOnce(new Error('offline'));
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Drop' }));

        await waitFor(() => expect(mockError).toHaveBeenCalled());
        expect(mockProcess).not.toHaveBeenCalled();
    });
});

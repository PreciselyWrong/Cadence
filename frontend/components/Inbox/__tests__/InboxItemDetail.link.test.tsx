import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import InboxItemDetail from '../InboxItemDetail';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, string | number>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const mockLookup = jest.fn();
jest.mock('../../../utils/linksService', () => ({
    ...jest.requireActual('../../../utils/linksService'),
    lookupAddress: (...args: unknown[]) => mockLookup(...args),
}));

jest.mock('../../../store/useStore', () => {
    const state = { tagsStore: { tags: [] }, areasStore: { areas: [] } };
    const useStore = () => state;
    useStore.getState = () => state;
    return { useStore };
});

jest.mock('../../../utils/focus', () => ({
    getFocus: () => null,
    mergeFocusTags: (names: string[]) => names,
    focusAreaIdForTask: () => undefined,
}));

jest.mock('../../../utils/inboxService', () => ({
    ...jest.requireActual('../../../utils/inboxService'),
    analyzeInboxText: jest.fn(),
    ensureAnalysisArea: (analysis: unknown) => Promise.resolve(analysis),
}));

const mockPreview = {
    url: 'https://example.com/rust',
    title: 'Rust patterns',
    description: 'A guide',
    image: null,
    siteName: null,
};

jest.mock('../../../utils/urlService', () => ({
    ...jest.requireActual('../../../utils/urlService'),
    fetchUrlPreview: () => Promise.resolve(mockPreview),
    urlPreviewWithin: () => Promise.resolve(mockPreview),
}));

// The real composer passes its live text to the footer.
jest.mock('../QuickCaptureInput', () => ({
    __esModule: true,
    default: function MockQuickCaptureInput(props: any) {
        return (
            <div>
                {props.renderFooterActions?.({
                    text: props.initialValue,
                    cleanedText: props.initialValue,
                    hashtags: [],
                    projectRefs: [],
                    analysis: null,
                })}
            </div>
        );
    },
}));

const projects = [{ uid: 'p1', name: 'Learning' } as any];

const renderItem = (content: string, extra: Record<string, unknown> = {}) => {
    const props = {
        openTaskModal: jest.fn(),
        openProjectModal: jest.fn(),
        openNoteModal: jest.fn(),
        onCaptureTask: jest.fn().mockResolvedValue(undefined),
        onAddToProject: jest.fn().mockResolvedValue(undefined),
        ...extra,
    };
    render(
        <MemoryRouter>
            <InboxItemDetail
                item={{ uid: 'i1', content, title: null } as any}
                onDelete={jest.fn()}
                projects={projects}
                {...props}
            />
        </MemoryRouter>
    );
    return props;
};

const open = async () => {
    fireEvent.click(
        await screen.findByRole('button', { name: /Rust patterns/ })
    );
};

const tagAndProject = () => {
    const tagField = screen
        .getAllByRole('textbox')
        .filter((field) => field.getAttribute('aria-label') !== 'Task name')[0];
    fireEvent.change(tagField, { target: { value: 'rust' } });
    fireEvent.keyDown(tagField, { key: 'Enter' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), {
        target: { value: 'p1' },
    });
};

describe('InboxItemDetail - a shared link', () => {
    beforeEach(() => {
        const { analyzeInboxText } = jest.requireMock(
            '../../../utils/inboxService'
        );
        analyzeInboxText.mockImplementation((text: string) =>
            Promise.resolve({ cleaned_content: text })
        );
    });

    it('shows what the page is instead of the bare address', async () => {
        renderItem('https://example.com/rust');

        expect(await screen.findByText('Rust patterns')).toBeInTheDocument();
        expect(screen.getByText('example.com')).toBeInTheDocument();
        expect(screen.queryByText('https://example.com/rust')).toBeNull();
    });

    beforeEach(() => {
        mockLookup.mockReset();
        mockLookup.mockResolvedValue({
            url: 'https://example.com/rust',
            kind: 'other',
            task_name: 'Rust patterns',
            tasks: [],
            projects: [],
        });
    });

    it('offers the task first, then Project…, Note, Inbox and Delete', async () => {
        renderItem('https://example.com/rust');
        await open();

        expect(screen.getByTestId('inbox-panel-fields')).toBeInTheDocument();
        expect(
            await screen.findByRole('textbox', { name: 'Task name' })
        ).toHaveValue('Rust patterns');
        for (const name of ['Task', 'Project…', 'Note', 'Inbox', 'Delete']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        expect(screen.queryByRole('button', { name: 'Links' })).toBeNull();
    });

    it('makes the task in one click, the address in the note, with the tag and project chosen', async () => {
        const { onCaptureTask, openTaskModal } = renderItem(
            'https://example.com/rust'
        );
        await open();
        tagAndProject();
        fireEvent.click(screen.getByRole('button', { name: 'Task' }));

        await waitFor(() =>
            expect(onCaptureTask).toHaveBeenCalledWith('i1', {
                url: 'https://example.com/rust',
                name: 'Rust patterns',
                note: 'https://example.com/rust',
                tags: ['rust'],
                project_uid: 'p1',
            })
        );
        expect(openTaskModal).not.toHaveBeenCalled();
    });

    it('keeps the name the user typed', async () => {
        const { onCaptureTask } = renderItem('https://example.com/rust');
        await open();
        const name = await screen.findByRole('textbox', { name: 'Task name' });
        await waitFor(() => expect(name).toHaveValue('Rust patterns'));
        fireEvent.change(name, { target: { value: 'Lire le guide' } });
        fireEvent.click(screen.getByRole('button', { name: 'Task' }));

        await waitFor(() =>
            expect(onCaptureTask).toHaveBeenCalledWith(
                'i1',
                expect.objectContaining({ name: 'Lire le guide' })
            )
        );
    });

    it('says where the address already is, with Open and Add anyway', async () => {
        mockLookup.mockResolvedValue({
            url: 'https://example.com/rust',
            kind: 'other',
            task_name: 'Rust patterns',
            tasks: [{ uid: 't1', name: 'Lire : Rust' }],
            projects: [{ uid: 'p2', name: 'Rust' }],
        });
        const { onCaptureTask } = renderItem('https://example.com/rust');
        await open();

        expect(
            await screen.findByText('Already in « Lire : Rust » +1')
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
            'href',
            '/task/t1'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
        await waitFor(() => expect(onCaptureTask).toHaveBeenCalled());
    });

    it('makes a task named after the page from an idea with words', async () => {
        const { openTaskModal } = renderItem(
            'https://example.com/rust read later'
        );
        await open();
        tagAndProject();
        fireEvent.click(screen.getByRole('button', { name: 'Task' }));

        await waitFor(() => expect(openTaskModal).toHaveBeenCalled());
        const [task, uid] = openTaskModal.mock.calls[0];
        expect(uid).toBe('i1');
        expect(task).toMatchObject({
            name: 'Rust patterns',
            note: 'https://example.com/rust\n\nread later',
            project_uid: 'p1',
        });
        expect(task.tags.map((tag: { name: string }) => tag.name)).toEqual([
            'rust',
        ]);
    });

    it('adds the page to the project picked under Project…', async () => {
        const { onAddToProject } = renderItem(
            'https://example.com/rust read later'
        );
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Project…' }));
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Learning' })
        );

        await waitFor(() =>
            expect(onAddToProject).toHaveBeenCalledWith('i1', {
                url: 'https://example.com/rust',
                title: 'Rust patterns',
                note: 'read later',
                project_uid: 'p1',
            })
        );
    });
});

describe('InboxItemDetail - an idea without address', () => {
    it('offers Project, not Project… nor Links', () => {
        renderItem('Plan the garden');
        fireEvent.click(
            screen.getByRole('button', { name: /Plan the garden/ })
        );

        expect(
            screen.getByRole('button', { name: 'Project' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Links' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Project…' })).toBeNull();
        expect(screen.queryByTestId('link-preview')).toBeNull();
    });
});

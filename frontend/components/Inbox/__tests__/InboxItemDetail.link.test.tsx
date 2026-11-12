import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InboxItemDetail from '../InboxItemDetail';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
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
        onSaveToLinks: jest.fn().mockResolvedValue(undefined),
        ...extra,
    };
    render(
        <InboxItemDetail
            item={{ uid: 'i1', content, title: null } as any}
            onDelete={jest.fn()}
            projects={projects}
            {...props}
        />
    );
    return props;
};

const open = async () => {
    fireEvent.click(
        await screen.findByRole('button', { name: /Rust patterns/ })
    );
};

const tagAndProject = () => {
    const tagField = screen.getByRole('textbox');
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

    it('lists a lone link as a row with a link icon, not a bordered card', async () => {
        renderItem('https://example.com/rust');

        const line = await screen.findByTestId('inbox-link-line');
        expect(line).toHaveTextContent('Rust patterns');
        expect(line.querySelector('svg')).toBeInTheDocument();
        expect(screen.queryByTestId('link-preview')).toBeNull();
    });

    it('offers tags, a project and the decisions Task, Links, Note, Delete', async () => {
        renderItem('https://example.com/rust');
        await open();

        expect(screen.getByTestId('inbox-panel-fields')).toBeInTheDocument();
        for (const name of ['Task', 'Links', 'Note', 'Delete']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        for (const name of ['Project', 'Keep', 'Try', 'Later']) {
            expect(screen.queryByRole('button', { name })).toBeNull();
        }
    });

    it('makes a task named after the page, with the tag and project chosen', async () => {
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

    it('keeps it in Links with its title, words, tag and project', async () => {
        const { onSaveToLinks } = renderItem(
            'https://example.com/rust read later'
        );
        await open();
        tagAndProject();
        fireEvent.click(screen.getByRole('button', { name: 'Links' }));

        await waitFor(() =>
            expect(onSaveToLinks).toHaveBeenCalledWith('i1', {
                url: 'https://example.com/rust',
                title: 'Rust patterns',
                note: 'read later',
                tags: ['rust'],
                project_uid: 'p1',
            })
        );
    });
});

describe('InboxItemDetail - an idea without address', () => {
    it('offers Project, not Links', () => {
        renderItem('Plan the garden');
        fireEvent.click(
            screen.getByRole('button', { name: /Plan the garden/ })
        );

        expect(
            screen.getByRole('button', { name: 'Project' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Links' })).toBeNull();
        expect(screen.queryByTestId('link-preview')).toBeNull();
    });
});

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MarkdownRenderer from '../MarkdownRenderer';

jest.mock('react-markdown', () => {
    return function ReactMarkdown({ children, components }: any) {
        const A = components?.a || 'a';
        const parts = (children as string).split(/(\[[^\]]+\]\([^)]+\))/);
        return (
            <div>
                {parts.map((part: string, index: number) => {
                    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                    return match ? (
                        <A key={index} href={match[2]}>
                            {match[1]}
                        </A>
                    ) : (
                        part
                    );
                })}
            </div>
        );
    };
});
jest.mock('remark-gfm', () => ({}));
jest.mock('rehype-highlight', () => ({}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, options?: Record<string, string>) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => options?.[k] ?? ''),
    }),
}));

const mockState = {
    notesStore: {
        notes: [] as Array<{ uid: string; title: string }>,
        hasLoaded: true,
        loadNotes: jest.fn(),
        addNote: jest.fn(),
    },
};

jest.mock('../../../utils/notesService', () => ({
    createNote: jest.fn(async (note: { title: string }) => ({
        uid: 'n-new',
        ...note,
    })),
}));
jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(async () => ({ uid: 't-new' })),
}));
jest.mock('../../../utils/contentLinksService', () => ({
    resolveTaskLinkStatus: jest.fn(async () => ({
        uids: { 'call bank': 't-1' },
        done: [],
    })),
}));
const mockOpenTaskPanel = jest.fn();
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: (uid: string) => mockOpenTaskPanel(uid),
}));
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));
jest.mock('../../../store/useStore', () => ({
    useStore: (selector: (s: typeof mockState) => unknown) =>
        selector(mockState),
}));

const renderMarkdown = (content: string) =>
    render(
        <MemoryRouter>
            <MarkdownRenderer content={content} />
        </MemoryRouter>
    );

describe('MarkdownRenderer wikilinks', () => {
    beforeEach(() => {
        mockState.notesStore.notes = [{ uid: 'p1', title: 'Projet' }];
        mockState.notesStore.hasLoaded = true;
        mockState.notesStore.loadNotes.mockClear();
    });

    it('opens the note of the same title whatever the case', () => {
        renderMarkdown('See [[PROJET]] today');

        expect(screen.getByRole('link', { name: /PROJET/ })).toHaveAttribute(
            'href',
            expect.stringMatching(/^\/note\/p1-projet$/)
        );
    });

    it('loads the note list when the page has not loaded it', () => {
        mockState.notesStore.hasLoaded = false;
        mockState.notesStore.notes = [];

        renderMarkdown('[[Projet]]');

        expect(mockState.notesStore.loadNotes).toHaveBeenCalled();
    });

    it('offers to create the note an unknown title points to', async () => {
        renderMarkdown('[[Inconnu]]');

        expect(screen.queryByRole('link')).toBeNull();
        fireEvent.click(
            screen.getByRole('button', { name: 'Create note "Inconnu"' })
        );
        await waitFor(() =>
            expect(mockNavigate).toHaveBeenCalledWith('/notes/n-new')
        );
        expect(mockState.notesStore.addNote).toHaveBeenCalled();
    });

    it('opens a [[task:Name]] link on the task found by name', async () => {
        renderMarkdown('[[task:Call bank]] and [[task:Missing one]]');

        expect(
            await screen.findByRole('link', { name: /Call bank/ })
        ).toHaveAttribute('href', '/task/t-1');
        fireEvent.click(
            screen.getByRole('button', { name: 'Create task "Missing one"' })
        );
        await waitFor(() =>
            expect(mockOpenTaskPanel).toHaveBeenCalledWith('t-new')
        );
    });

    it('shows a person mention as a chip to their page', () => {
        renderMarkdown('Ask @[Anna](person:abc123def456ghj) first');

        expect(screen.getByTestId('mention-chip')).toHaveAttribute(
            'href',
            '/person/abc123def456ghj'
        );
        expect(screen.getByTestId('mention-chip')).toHaveTextContent('@Anna');
    });

    it('opens web links in a new tab and app links in the app', () => {
        renderMarkdown(
            '[site](https://example.org/x) [task](/task/abc123def456ghj)'
        );

        const site = screen.getByRole('link', { name: 'site' });
        expect(site).toHaveAttribute('target', '_blank');
        expect(site).toHaveAttribute('rel', 'noopener noreferrer');
        const task = screen.getByRole('link', { name: 'task' });
        expect(task).toHaveAttribute('href', '/task/abc123def456ghj');
        expect(task).not.toHaveAttribute('target');
    });
});

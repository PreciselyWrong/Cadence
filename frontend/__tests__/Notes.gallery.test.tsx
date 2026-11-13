import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Notes from '../components/Notes';
import { useViewType } from '../hooks/useViewType';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

jest.mock('../components/Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: jest.fn(),
    }),
}));

jest.mock('../utils/notesService', () => ({
    createNote: jest.fn(),
    updateNote: jest.fn(async (uid: string, data: any) => ({ ...data, uid })),
    fetchNoteBySlug: jest.fn(),
}));

jest.mock('../components/Note/MarkdownEditor', () => ({
    __esModule: true,
    default: ({ value }: any) => (
        <textarea aria-label="markdown-editor" value={value} readOnly />
    ),
}));

jest.mock('../components/Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: any) => <div>{content}</div>,
}));

jest.mock('../components/Note/NoteModal', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../components/Note/NoteFocusMode', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../hooks/useViewType', () => ({
    useViewType: jest.fn(),
}));

const noteA = {
    uid: 'note-a',
    title: 'Trip ideas',
    content: 'Lakes\n\n![Lake](https://img.test/lake.jpg)',
    updated_at: '2026-01-02T00:00:00Z',
    tags: [{ uid: 'tg1', name: 'travel' }],
};
const noteB = {
    uid: 'note-b',
    title: 'Reading',
    content: 'See https://site.test/post',
    updated_at: '2026-01-01T00:00:00Z',
};
const noteC = {
    uid: 'note-c',
    title: 'Plain words',
    content: '# Heading\n\nJust **text** here.',
    updated_at: '2025-12-31T00:00:00Z',
};

let storeState: any;

jest.mock('../store/useStore', () => {
    const mockUseStore: any = (selector?: any) =>
        selector ? selector(storeState) : storeState;
    mockUseStore.getState = () => storeState;
    return { useStore: mockUseStore };
});

const mockViewType = useViewType as jest.Mock;

// Layout keys the page by pathname, so leaving /notes/:uid remounts it.
const KeyedByPath: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <React.Fragment key={useLocation().pathname}>{children}</React.Fragment>
);

const renderInLayout = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <KeyedByPath>
                <Routes>
                    <Route path="/notes" element={<Notes />} />
                    <Route path="/notes/:uid" element={<Notes />} />
                </Routes>
            </KeyedByPath>
        </MemoryRouter>
    );

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/notes" element={<Notes />} />
                <Route path="/notes/:uid" element={<Notes />} />
            </Routes>
        </MemoryRouter>
    );

describe('Notes gallery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        storeState = {
            notesStore: {
                notes: [noteA, noteB, noteC],
                isLoading: false,
                isError: false,
                hasLoaded: true,
                loadNotes: jest.fn(),
                setNotes: jest.fn(),
            },
            projectsStore: { projects: [] },
            tagsStore: {
                tags: [],
                addNewTags: jest.fn(),
                getTags: jest.fn(() => []),
            },
        };
    });

    it('lands on the gallery instead of opening the latest note', async () => {
        mockViewType.mockReturnValue({
            viewType: 'gallery',
            setViewType: jest.fn(),
            loaded: true,
        });

        renderAt('/notes');

        const cards = await screen.findAllByTestId('gallery-card');
        expect(cards).toHaveLength(3);
        expect(screen.queryByLabelText('markdown-editor')).toBeNull();
        expect(mockViewType).toHaveBeenCalledWith('notes');
    });

    it("shows a note's own image, else its words", async () => {
        mockViewType.mockReturnValue({
            viewType: 'gallery',
            setViewType: jest.fn(),
            loaded: true,
        });

        renderAt('/notes');

        const cards = await screen.findAllByTestId('gallery-card');
        const imageOf = (card: HTMLElement) =>
            card.querySelector('img')?.getAttribute('src');
        expect(imageOf(cards[0])).toBe('https://img.test/lake.jpg');
        expect(imageOf(cards[1])).toBeUndefined();
        expect(cards[2]).toHaveTextContent('Heading Just text here.');
        expect(cards[0]).toHaveTextContent('travel');
        expect(cards[0].querySelector('a')).toHaveAttribute(
            'href',
            '/notes/note-a'
        );
    });

    it('switches between list and gallery from the overview', async () => {
        const setViewType = jest.fn();
        mockViewType.mockReturnValue({
            viewType: 'gallery',
            setViewType,
            loaded: true,
        });

        renderAt('/notes');

        fireEvent.click(await screen.findByRole('tab', { name: 'List' }));
        expect(setViewType).toHaveBeenCalledWith('list');
    });

    it('reaches the overview from a note with "All notes"', async () => {
        mockViewType.mockReturnValue({
            viewType: 'list',
            setViewType: jest.fn(),
            loaded: true,
        });

        renderAt('/notes/note-a');

        expect(
            await screen.findByDisplayValue('Trip ideas')
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'notes.noteOptions' })
        );
        fireEvent.click(screen.getByRole('button', { name: /All notes/ }));

        await waitFor(() =>
            expect(
                screen.getByRole('tab', { name: 'Gallery' })
            ).toBeInTheDocument()
        );
        expect(screen.queryByDisplayValue('Trip ideas')).toBeNull();
    });

    it('stays on the overview when the page remounts on the new path', async () => {
        mockViewType.mockReturnValue({
            viewType: 'list',
            setViewType: jest.fn(),
            loaded: true,
        });

        renderInLayout('/notes/note-a');

        expect(
            await screen.findByDisplayValue('Trip ideas')
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'notes.noteOptions' })
        );
        fireEvent.click(screen.getByRole('button', { name: /All notes/ }));

        expect(
            await screen.findByRole('tab', { name: 'Gallery' })
        ).toBeInTheDocument();
        expect(screen.queryByDisplayValue('Trip ideas')).toBeNull();
    });
});

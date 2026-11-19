import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Notes from '../components/Notes';
import { useViewType } from '../hooks/useViewType';
import { deleteNote, updateNote } from '../utils/notesService';
import { UNDO_WINDOW_MS } from '../utils/deferredDelete';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

const mockShowUndoToast = jest.fn();
jest.mock('../components/Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: mockShowUndoToast,
    }),
}));

jest.mock('../utils/notesService', () => ({
    createNote: jest.fn(),
    deleteNote: jest.fn(async () => undefined),
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
    content: 'Lakes',
    updated_at: '2026-01-02T00:00:00Z',
};
const noteB = {
    uid: 'note-b',
    title: 'Reading',
    content: 'Books',
    updated_at: '2026-01-01T00:00:00Z',
};

let storeState: any;

jest.mock('../store/useStore', () => {
    const mockUseStore: any = (selector?: any) =>
        selector ? selector(storeState) : storeState;
    mockUseStore.getState = () => storeState;
    return { useStore: mockUseStore };
});

const LocationSpy = () => (
    <div data-testid="location">{useLocation().pathname}</div>
);

const renderNotes = () =>
    render(
        <MemoryRouter initialEntries={['/notes']}>
            <Routes>
                <Route
                    path="/notes"
                    element={
                        <>
                            <Notes />
                            <LocationSpy />
                        </>
                    }
                />
                <Route
                    path="/notes/:uid"
                    element={
                        <>
                            <Notes />
                            <LocationSpy />
                        </>
                    }
                />
                <Route path="/note/:id" element={<LocationSpy />} />
            </Routes>
        </MemoryRouter>
    );

describe('Notes row menu', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useViewType as jest.Mock).mockReturnValue({
            viewType: 'list',
            setViewType: jest.fn(),
            loaded: true,
        });
        storeState = {
            notesStore: {
                notes: [noteA, noteB],
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

    afterEach(() => {
        jest.useRealTimers();
    });

    it('right click on a note row offers Open, Pin and Delete', () => {
        renderNotes();

        fireEvent.contextMenu(screen.getByTestId('note-row-note-a'));

        expect(
            screen.getByRole('menuitem', { name: 'Open' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'Pin to sidebar' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'Delete' })
        ).toBeInTheDocument();
    });

    it('Open goes to the note page the row links to', () => {
        renderNotes();

        fireEvent.contextMenu(screen.getByTestId('note-row-note-a'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));

        expect(screen.getByTestId('location')).toHaveTextContent(
            '/note/note-a-trip-ideas'
        );
    });

    it('Pin saves the pin of that note', () => {
        renderNotes();

        fireEvent.contextMenu(screen.getByTestId('note-row-note-b'));
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Pin to sidebar' })
        );

        expect(updateNote).toHaveBeenCalledWith('note-b', {
            pin_to_sidebar: true,
        });
    });

    it('Delete runs the existing undo delete, committed after the window', async () => {
        jest.useFakeTimers();
        renderNotes();

        fireEvent.contextMenu(screen.getByTestId('note-row-note-a'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

        expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
        expect(deleteNote).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(UNDO_WINDOW_MS);
        });

        expect(deleteNote).toHaveBeenCalledWith('note-a', {
            keepalive: false,
        });
    });
});

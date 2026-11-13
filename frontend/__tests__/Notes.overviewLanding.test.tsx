import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
    updateNote: jest.fn(),
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

import { fetchNoteBySlug } from '../utils/notesService';

const mockFetchNoteBySlug = fetchNoteBySlug as jest.Mock;
const mockViewType = useViewType as jest.Mock;

const newestNote = {
    uid: 'note-a',
    title: 'Trip ideas',
    content: 'Lakes',
    updated_at: '2026-01-02T00:00:00Z',
};
const olderNote = {
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

const setWindowWidth = (width: number) =>
    Object.defineProperty(window, 'innerWidth', {
        value: width,
        configurable: true,
    });

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/notes" element={<Notes />} />
                <Route path="/notes/:uid" element={<Notes />} />
            </Routes>
        </MemoryRouter>
    );

describe('Notes landing on the overview (no note auto-opened)', () => {
    const originalWidth = window.innerWidth;

    beforeEach(() => {
        jest.clearAllMocks();
        mockViewType.mockReturnValue({
            viewType: 'list',
            setViewType: jest.fn(),
            loaded: true,
        });
        storeState = {
            notesStore: {
                notes: [newestNote, olderNote],
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

    afterEach(() => setWindowWidth(originalWidth));

    it('shows the overview on /notes on a desktop width, not the latest note', async () => {
        setWindowWidth(1280);

        renderAt('/notes');

        expect(await screen.findByText('Trip ideas')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.queryByLabelText('markdown-editor')).toBeNull();
        expect(screen.queryByDisplayValue('Trip ideas')).toBeNull();
    });

    it('shows the overview on /notes on a phone width too', async () => {
        setWindowWidth(375);

        renderAt('/notes');

        expect(await screen.findByText('Trip ideas')).toBeInTheDocument();
        expect(screen.queryByLabelText('markdown-editor')).toBeNull();
    });

    it('shows the overview, not the first note, when the URL note is missing', async () => {
        setWindowWidth(1280);
        mockFetchNoteBySlug.mockResolvedValue(null);

        renderAt('/notes/does-not-exist');

        expect(await screen.findByText('Trip ideas')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.queryByLabelText('markdown-editor')).toBeNull();
        expect(screen.queryByDisplayValue('Trip ideas')).toBeNull();
    });
});

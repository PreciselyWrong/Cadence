import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NoteCard from '../NoteCard';
import { updateNote, fetchNoteBySlug } from '../../../utils/notesService';
import { useStore } from '../../../store/useStore';

jest.mock('react-router-dom', () => ({
    Link: ({ children, to, ...rest }: any) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
    useNavigate: () => jest.fn(),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('../../../utils/notesService', () => ({
    updateNote: jest.fn(),
    fetchNoteBySlug: jest.fn(),
}));

const note = { uid: 'n1', title: 'Trip ideas', content: 'Lisbon' };

beforeEach(() => {
    (updateNote as jest.Mock).mockResolvedValue({ ...note, Tags: [] });
    (fetchNoteBySlug as jest.Mock).mockResolvedValue({ ...note, Tags: [] });
    useStore.setState((state: any) => ({
        tagsStore: {
            ...state.tagsStore,
            tags: [{ id: 2, uid: 'g2', name: 'perso/voyage' }],
        },
        notesStore: { ...state.notesStore, notes: [note] },
    }));
});

describe('NoteCard dragged onto the sidebar', () => {
    it('tags the note with the tag it is dropped on', async () => {
        render(<NoteCard note={note} />);
        const card = screen
            .getByText('Trip ideas')
            .closest('[draggable="true"]') as HTMLElement;
        const tag = document.createElement('div');
        tag.setAttribute('data-sidebar-drop', 'tag:g2');
        document.body.appendChild(tag);

        fireEvent.dragStart(card, {
            dataTransfer: { setData: jest.fn(), effectAllowed: '' },
        });
        expect(fireEvent.dragOver(tag)).toBe(false);
        fireEvent.drop(tag);

        await waitFor(() =>
            expect(updateNote).toHaveBeenCalledWith('n1', {
                tags: [{ name: 'perso/voyage' }],
            })
        );
        tag.remove();
    });
});

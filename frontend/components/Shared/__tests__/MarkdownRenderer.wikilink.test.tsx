import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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
        t: (_key: string, fallback: string) => fallback,
    }),
}));

const mockState = {
    notesStore: {
        notes: [] as Array<{ uid: string; title: string }>,
        hasLoaded: true,
        loadNotes: jest.fn(),
    },
};
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

    it('shows an unknown title as not found, without a link', () => {
        renderMarkdown('[[Inconnu]]');

        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.getByTitle('Note not found')).toBeInTheDocument();
    });
});

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import MarkdownRenderer from '../MarkdownRenderer';

// react-markdown ships as ESM only; this stand-in renders plain text and
// [text](href) links through the renderer's own `a` component.
jest.mock('react-markdown', () => {
    return function ReactMarkdown({ children, components }: any) {
        const A = components?.a || 'a';
        const parts = (children as string).split(/(\[[^\]]+\]\([^)]+\))/);
        return (
            <div className="markdown-content">
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

jest.mock('../../../store/useStore', () => {
    const state = {
        notesStore: {
            notes: [{ uid: 'n-1', title: 'Budget', content: '' }],
        },
    };
    return {
        useStore: (selector: (s: typeof state) => unknown) => selector(state),
    };
});

describe('MarkdownRenderer note links on a public page', () => {
    const renderPublic = () =>
        render(
            <MemoryRouter>
                <MarkdownRenderer
                    content="See [[packing list]] and [[Budget]]."
                    publicNoteLinks={[{ title: 'Packing list', token: 'tok' }]}
                />
            </MemoryRouter>
        );

    it('links a linked note that is public to its public page', () => {
        renderPublic();
        const link = screen.getByText('packing list').closest('a');
        expect(link).toHaveAttribute('href', '/public/notes/tok');
    });

    it("does not use the reader's own notes for links that are not public", () => {
        renderPublic();
        expect(screen.getByText('Budget').closest('a')).toBeNull();
    });

    it('says a private linked note is not shared when clicked', () => {
        renderPublic();
        fireEvent.click(screen.getByText('Budget'));
        expect(
            screen.getByText('This note is not shared publicly.')
        ).toBeInTheDocument();
    });

    it('opens linked notes where the page says, such as a blog post', () => {
        render(
            <MemoryRouter>
                <MarkdownRenderer
                    content="See [[packing list]]."
                    publicNoteLinks={[
                        { title: 'Packing list', slug: 'packing-list' },
                    ]}
                    publicNoteHref={(link) => `/blog/${link.slug}`}
                />
            </MemoryRouter>
        );
        const link = screen.getByText('packing list').closest('a');
        expect(link).toHaveAttribute('href', '/blog/packing-list');
    });
});

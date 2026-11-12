import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MarkdownRenderer from '../MarkdownRenderer';
import { toggleTaskCompletion } from '../../../utils/tasksService';

// A small stand-in for react-markdown: nested "- " lists only, with the
// source line of each item (as remark gives it) on its node.
jest.mock('react-markdown', () => {
    return function ReactMarkdown({ children, components }: any) {
        const lines = (children as string).split('\n');
        const Ul = components.ul;
        const Li = components.li;
        const Input = components.input;
        const indentOf = (l: string) => l.match(/^\s*/)[0].length;
        const list = (from: number, to: number): any => {
            const base = indentOf(lines[from]);
            const items: any[] = [];
            let i = from;
            while (i < to) {
                let j = i + 1;
                while (j < to && indentOf(lines[j]) > base) j++;
                const m = lines[i].match(/^\s*- (\[([ x])\] )?(.*)$/);
                items.push(
                    <Li key={i} node={{ position: { start: { line: i + 1 } } }}>
                        {m[1] && (
                            <Input type="checkbox" checked={m[2] === 'x'} />
                        )}
                        {m[3]}
                        {j > i + 1 && list(i + 1, j)}
                    </Li>
                );
                i = j;
            }
            const tasks = lines
                .slice(from, to)
                .some((l) => indentOf(l) === base && /^\s*- \[/.test(l));
            return (
                <Ul
                    node={{ tagName: 'ul' }}
                    className={tasks ? 'contains-task-list' : undefined}
                >
                    {items}
                </Ul>
            );
        };
        return <div>{list(0, lines.length)}</div>;
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
        notesStore: { notes: [], hasLoaded: true, loadNotes: jest.fn() },
    };
    return {
        useStore: (selector: (s: typeof state) => unknown) => selector(state),
    };
});
jest.mock('../../../utils/contentLinksService', () => ({
    resolveTaskLinkStatus: jest.fn(async () => ({
        uids: { call: 't-1', write: 't-2' },
        done: ['call'],
    })),
}));
jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(),
    toggleTaskCompletion: jest.fn(async () => ({ status: 2 })),
}));

const doc = '- top\n  - mid\n    - leaf\n- next';

const renderOutline = (
    content: string,
    onContentChange?: (next: string) => void
) =>
    render(
        <MemoryRouter>
            <MarkdownRenderer
                content={content}
                outlineKey="note:n1"
                onContentChange={onContentChange}
            />
        </MemoryRouter>
    );

afterEach(() => window.localStorage.clear());

describe('MarkdownRenderer outline', () => {
    it('folds an item from its caret and remembers it', () => {
        const { unmount } = renderOutline(doc);
        expect(screen.getByText('leaf')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Collapse' })[0]);
        expect(screen.queryByText('mid')).toBeNull();
        expect(
            JSON.parse(
                window.localStorage.getItem('cadence.outlineFolds.note:n1')!
            )
        ).toEqual(['top#0']);
        unmount();
        renderOutline(doc);
        expect(screen.queryByText('mid')).toBeNull();
        fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[0]);
        expect(screen.getByText('leaf')).toBeInTheDocument();
    });

    it('zooms into a bullet and back with the breadcrumb', () => {
        renderOutline(doc);
        const zoom = screen.getAllByRole('button', { name: 'Zoom in' });
        fireEvent.click(zoom[1]);
        expect(screen.getByText('mid')).toBeInTheDocument();
        expect(screen.queryByText('next')).toBeNull();
        expect(screen.getByTestId('outline-breadcrumb').textContent).toBe(
            'All›top'
        );
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(screen.getByText('next')).toBeInTheDocument();
    });

    it('writes a checkbox toggled while zoomed back into the whole text', () => {
        const onChange = jest.fn();
        renderOutline('- a\n  - [ ] b\n- c', onChange);
        fireEvent.click(screen.getAllByRole('button', { name: 'Zoom in' })[0]);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(onChange).toHaveBeenCalledWith('- a\n  - [x] b\n- c');
    });

    it('checks a box linked to a done task and completes the task on click', async () => {
        const onChange = jest.fn();
        await act(async () => {
            renderOutline(
                '- [ ] [[task:Call]]\n- [x] [[task:Write]]',
                onChange
            );
        });
        // The list keeps its indent, so the bullets and carets stay visible.
        expect(document.querySelector('ul.contains-task-list')).toHaveClass(
            'pl-5'
        );
        const [call, write] = screen.getAllByRole('checkbox');
        expect(call).toBeChecked();
        expect(write).not.toBeChecked();
        await act(async () => {
            fireEvent.click(write);
        });
        expect(toggleTaskCompletion).toHaveBeenCalledWith('t-2');
        expect(write).toBeChecked();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps plain lists without outline controls when no key is given', () => {
        render(
            <MemoryRouter>
                <MarkdownRenderer content={doc} />
            </MemoryRouter>
        );
        expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
    });
});

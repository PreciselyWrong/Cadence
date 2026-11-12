import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import MarkdownEditor from '../MarkdownEditor';
import { fetchPeople } from '../../../utils/peopleService';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (_key: string, fallback: string, options?: Record<string, string>) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => options?.[k] ?? ''),
    }),
}));

const showErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast, showSuccessToast: jest.fn() }),
}));

const addNote = jest.fn();
jest.mock('../../../store/useStore', () => {
    const state = {
        notesStore: {
            notes: [{ uid: 'n-1', title: 'Groceries', content: '' }],
            hasLoaded: true,
            loadNotes: jest.fn(),
            addNote: (...args: unknown[]) => addNote(...args),
        },
    };
    return {
        useStore: (selector: (s: typeof state) => unknown) => selector(state),
    };
});

jest.mock('../../../utils/notesService', () => ({
    createNote: jest.fn(),
}));

jest.mock('../../../utils/peopleService', () => ({
    fetchPeople: jest.fn(),
}));

const typeText = (view: EditorView, text: string) => {
    for (const ch of text) {
        const pos = view.state.selection.main.head;
        act(() => {
            view.dispatch({
                changes: { from: pos, insert: ch },
                selection: { anchor: pos + ch.length },
                userEvent: 'input.type',
            });
        });
    }
};

const renderEditor = (value = '', onBlur?: () => void) => {
    const onChange = jest.fn();
    const { container } = render(
        <MemoryRouter>
            <MarkdownEditor value={value} onChange={onChange} onBlur={onBlur} />
            <button type="button">elsewhere</button>
        </MemoryRouter>
    );
    const content = container.querySelector('.cm-content');
    const view = content && EditorView.findFromDOM(content as HTMLElement);
    if (!view) throw new Error('editor did not mount');
    view.coordsAtPos = () => ({ left: 10, right: 10, top: 10, bottom: 20 });
    return { view, onChange, content: content as HTMLElement };
};

describe('MarkdownEditor toolbar and mentions', () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });

    it('formats the selection from the bar under the text', () => {
        const { view, onChange } = renderEditor('buy milk');
        act(() => view.dispatch({ selection: { anchor: 4, head: 8 } }));

        fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
        expect(onChange).toHaveBeenLastCalledWith('buy **milk**');
        expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
            'title',
            'Bold (Ctrl+B)'
        );

        fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
        expect(onChange).toHaveBeenLastCalledWith('- buy **milk**');
    });

    it('inserts a table from the picker and edits it', () => {
        const { view, onChange } = renderEditor('');
        fireEvent.click(screen.getByRole('button', { name: 'Table' }));
        fireEvent.click(
            screen.getByRole('button', { name: '2 rows × 3 columns' })
        );
        expect(onChange).toHaveBeenLastCalledWith(
            '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|   |   |   |'
        );

        act(() =>
            view.dispatch({ selection: { anchor: view.state.doc.length - 2 } })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add a row' }));
        expect(view.state.doc.toString().split('\n')).toHaveLength(4);
    });

    it('offers people after "@" and stores the picked one as a token', async () => {
        (fetchPeople as jest.Mock).mockResolvedValue([
            { uid: 'abc123def456ghj', name: 'Anna' },
            { uid: 'zzz123def456ghj', name: 'Bob' },
        ]);
        const { view, onChange } = renderEditor('');

        typeText(view, 'Ask @an');
        expect(
            await screen.findByRole('option', { name: /Anna/ })
        ).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /Bob/ })).toBeNull();

        fireEvent.keyDown(window, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith(
            'Ask @[Anna](person:abc123def456ghj) '
        );
        expect(screen.queryByTestId('mention-menu')).toBeNull();
    });

    it('keeps Enter out of the text while people are loading', () => {
        (fetchPeople as jest.Mock).mockReturnValue(new Promise(() => {}));
        const { view } = renderEditor('');
        typeText(view, '@a');
        expect(screen.getByText('Loading people…')).toBeInTheDocument();

        const enter = new KeyboardEvent('keydown', {
            key: 'Enter',
            cancelable: true,
        });
        window.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(true);
    });

    it('reports a blur only when focus leaves the editor and its bar', () => {
        const onBlur = jest.fn();
        const { content } = renderEditor('text', onBlur);
        const bold = screen.getByRole('button', { name: 'Bold' });

        fireEvent.blur(content, { relatedTarget: bold });
        expect(onBlur).not.toHaveBeenCalled();

        fireEvent.blur(content, {
            relatedTarget: screen.getByRole('button', { name: 'elsewhere' }),
        });
        expect(onBlur).toHaveBeenCalledTimes(1);
    });
});

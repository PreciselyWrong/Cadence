import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { foldedRanges } from '@codemirror/language';
import { livePreviewExtension } from '../index';
import {
    isFolded,
    outlineExtension,
    restoreFolds,
    toggleFoldAt,
    zoomPath,
    zoomRootLine,
    zoomTo,
} from '../outlineEditor';

const views: EditorView[] = [];

const editor = (
    doc: string,
    caret: number,
    config: Parameters<typeof outlineExtension>[0] = {}
) => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc,
            selection: { anchor: caret },
            extensions: [
                markdown({ base: markdownLanguage }),
                livePreviewExtension(),
                outlineExtension(config),
            ],
        }),
    });
    views.push(view);
    return view;
};

const press = (view: EditorView, key: string, mods: KeyboardEventInit = {}) =>
    runScopeHandlers(
        view,
        new KeyboardEvent('keydown', { key, ...mods }),
        'editor'
    );

const text = (view: EditorView) => view.state.doc.toString();
const caret = (view: EditorView) => view.state.selection.main.head;

afterEach(() => {
    views.splice(0).forEach((v) => v.destroy());
    window.localStorage.clear();
});

describe('outliner keys in the editor', () => {
    it('Enter splits the bullet and Tab nests it with its children', () => {
        const view = editor('- a\n- b', 3);
        expect(press(view, 'Enter')).toBe(true);
        expect(text(view)).toBe('- a\n- \n- b');
        view.dispatch({ changes: { from: 6, insert: 'x' } });
        view.dispatch({ selection: { anchor: 7 } });
        expect(press(view, 'Tab')).toBe(true);
        expect(text(view)).toBe('- a\n  - x\n- b');
        expect(press(view, 'Tab', { shiftKey: true })).toBe(true);
        expect(text(view)).toBe('- a\n- x\n- b');
    });

    it('Tab outside a list is left to the browser (focus moves on)', () => {
        const view = editor('plain', 2);
        expect(press(view, 'Tab')).toBe(false);
    });

    it('Alt-ArrowUp moves the bullet with its children', () => {
        const view = editor('- a\n- b\n  - b1', 6);
        expect(press(view, 'ArrowUp', { altKey: true })).toBe(true);
        expect(text(view)).toBe('- b\n  - b1\n- a');
        expect(caret(view)).toBe(2);
    });

    it('Ctrl-Enter cycles the checkbox', () => {
        const view = editor('- call', 6);
        press(view, 'Enter', { ctrlKey: true });
        expect(text(view)).toBe('- [ ] call');
        press(view, 'Enter', { ctrlKey: true });
        expect(text(view)).toBe('- [x] call');
    });

    it('Shift-Enter breaks the line inside the bullet', () => {
        const view = editor('- ab', 3);
        press(view, 'Enter', { shiftKey: true });
        expect(text(view)).toBe('- a\n  b');
    });

    it('a right-click on a checkbox does not tick it (it opens the menu)', () => {
        const onBulletMenu = jest.fn();
        const view = editor('- [ ] call\n- x', 14, { onBulletMenu });
        const box = view.contentDOM.querySelector('.cm-md-checkbox')!;
        box.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, button: 2 })
        );
        box.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        expect(text(view)).toBe('- [ ] call\n- x');
        expect(onBulletMenu).toHaveBeenCalledWith(view, 0, 0, 0);
        box.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, button: 0 })
        );
        expect(text(view)).toBe('- [x] call\n- x');
    });

    it('typing on an empty line starts a bullet', () => {
        const view = editor('', 0);
        const handled = view.state
            .facet(EditorView.inputHandler)
            .some((h) => h(view, 0, 0, 'h', () => view.state.update({})));
        expect(handled).toBe(true);
        expect(text(view)).toBe('- h');
    });
});

describe('folds', () => {
    const doc = '- a\n  - a1\n- b';

    it('Ctrl-ArrowUp folds the children, Ctrl-ArrowDown opens them', () => {
        const view = editor(doc, 1);
        press(view, 'ArrowUp', { ctrlKey: true });
        expect(isFolded(view.state, 0)).toBe(true);
        press(view, 'ArrowDown', { ctrlKey: true });
        expect(isFolded(view.state, 0)).toBe(false);
    });

    it('remembers folds per note in this browser', () => {
        const first = editor(doc, 1, { storageKey: 'note:n1' });
        toggleFoldAt(first, 0);
        expect(
            JSON.parse(
                window.localStorage.getItem('cadence.outlineFolds.note:n1')!
            )
        ).toEqual(['a#0']);
        const again = editor(doc, 1, { storageKey: 'note:n1' });
        restoreFolds(again);
        expect(foldedRanges(again.state).size).toBe(1);
        const other = editor(doc, 1, { storageKey: 'note:n2' });
        restoreFolds(other);
        expect(foldedRanges(other.state).size).toBe(0);
    });

    it('keeps an item folded when it moves', () => {
        const view = editor('- x\n- a\n  - a1', 5);
        toggleFoldAt(view, 1);
        press(view, 'ArrowUp', { altKey: true });
        expect(text(view)).toBe('- a\n  - a1\n- x');
        expect(isFolded(view.state, 0)).toBe(true);
    });

    it('clicking the caret before a bullet toggles its fold', () => {
        const view = editor(doc, 13);
        const caretEl = view.contentDOM.querySelector('.cm-outline-fold');
        expect(caretEl).not.toBeNull();
        caretEl!.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, button: 0 })
        );
        expect(isFolded(view.state, 0)).toBe(true);
    });
});

describe('zoom', () => {
    const doc = '- top\n  - mid\n    - leaf\n  - other\n- next';

    it('shows only the zoomed item and reports the path', () => {
        const onZoomChange = jest.fn();
        const view = editor(doc, 0, { onZoomChange });
        zoomTo(view, 1);
        expect(zoomRootLine(view.state)).toBe(1);
        expect(zoomPath(view.state)).toEqual([
            { line: 0, text: 'top' },
            { line: 1, text: 'mid' },
        ]);
        expect(onZoomChange).toHaveBeenLastCalledWith([
            { line: 0, text: 'top' },
            { line: 1, text: 'mid' },
        ]);
        expect(view.contentDOM.textContent).not.toContain('next');
        expect(view.contentDOM.textContent).toContain('leaf');
    });

    it('refuses changes outside the zoomed item', () => {
        const view = editor(doc, 0);
        zoomTo(view, 1);
        view.dispatch({ changes: { from: 0, to: 5, insert: 'gone' } });
        expect(text(view)).toBe(doc);
        press(view, 'a', { ctrlKey: true });
        const { from, to } = view.state.selection.main;
        expect(view.state.sliceDoc(from, to)).toBe('  - mid\n    - leaf');
    });

    it('Enter on the zoom title adds a first child; Ctrl-, zooms out', () => {
        const view = editor(doc, 0);
        zoomTo(view, 1);
        press(view, 'Enter');
        expect(text(view)).toBe(
            '- top\n  - mid\n    - \n    - leaf\n  - other\n- next'
        );
        press(view, ',', { ctrlKey: true });
        expect(zoomRootLine(view.state)).toBe(0);
        press(view, ',', { ctrlKey: true });
        expect(zoomRootLine(view.state)).toBeNull();
    });

    it('clicking a bullet zooms into it', () => {
        const view = editor('- a\n  - b\n- c', 0);
        const bullets = view.contentDOM.querySelectorAll('.cm-md-bullet');
        bullets[1].dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, button: 0 })
        );
        expect(zoomRootLine(view.state)).toBe(1);
    });
});

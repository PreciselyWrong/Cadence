import { EditorView } from '@codemirror/view';
import {
    TextEdit,
    TextSelection,
    insertLink as linkEdit,
    toggleHeading,
    toggleWrap,
} from './markdownFormat';

// Applies a pure Markdown edit (markdownFormat.ts) to a CodeMirror view.
// Returns false when the command does not apply here (e.g. no table).
export function runEdit(
    view: EditorView,
    command: (sel: TextSelection) => TextEdit | null
): boolean {
    const { from, to } = view.state.selection.main;
    const edit = command({ doc: view.state.doc.toString(), from, to });
    if (!edit) return false;
    view.dispatch({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
        selection: { anchor: edit.anchor, head: edit.head },
        scrollIntoView: true,
        userEvent: 'input',
    });
    view.focus();
    return true;
}

export function wrapSelection(
    view: EditorView,
    prefix: string,
    suffix: string = prefix
) {
    runEdit(view, (sel) => toggleWrap(sel, prefix, suffix));
}

export function setHeading(view: EditorView, level: number) {
    runEdit(view, (sel) => toggleHeading(sel, level));
}

export function insertLink(view: EditorView) {
    runEdit(view, linkEdit);
}

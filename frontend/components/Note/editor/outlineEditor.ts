// The outliner on top of the CodeMirror Markdown editor: keys (Enter, Tab,
// Backspace, Alt-↑/↓, fold, zoom, checkbox), fold carets and zoom, all as
// edits of the Markdown text (outline.ts). Nothing is stored beside the
// text except, per viewer, which items are folded (outlineFolds.ts).

import {
    EditorState,
    Extension,
    Facet,
    Prec,
    RangeSetBuilder,
    StateEffect,
    StateField,
    Transaction,
} from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    KeyBinding,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
    keymap,
} from '@codemirror/view';
import {
    codeFolding,
    foldEffect,
    foldedRanges,
    unfoldEffect,
} from '@codemirror/language';
import { TextEdit, TextSelection } from './markdownFormat';
import {
    Outline,
    OutlineOptions,
    ancestorLines,
    autoBullet,
    backspaceItem,
    foldRange,
    indentItems,
    isNoop,
    itemAtLine,
    itemKeys,
    moveItem,
    outdentItems,
    parseOutline,
    softBreak,
    splitItem,
    toggleItemBox,
} from './outline';
import { loadFolds, saveFolds } from './outlineFolds';
import { outlineMode } from './outlineMode';

export { outlineMode };

export interface ZoomCrumb {
    line: number;
    text: string;
}

export interface OutlineConfig {
    // Where fold state is kept for this viewer ("note:<uid>"); none = not
    // kept across visits.
    storageKey?: string;
    onMakeTask?: (view: EditorView, pos: number) => void;
    onBulletMenu?: (
        view: EditorView,
        line: number,
        x: number,
        y: number
    ) => void;
    // The zoom path (top item first), or null when not zoomed.
    onZoomChange?: (path: ZoomCrumb[] | null) => void;
}

export const outlineConfig = Facet.define<OutlineConfig, OutlineConfig>({
    combine: (values) => Object.assign({}, ...values),
});

// Transactions that replace the whole text from outside (another note):
// they leave the zoom and pass its guard.
export const externalSync = Transaction.userEvent.of('outline.sync');

// ---- zoom ---------------------------------------------------------------

export const setZoom = StateEffect.define<number | null>();

// The start of the zoomed-in item's first line.
export const zoomField = StateField.define<number | null>({
    create: () => null,
    update(pos, tr) {
        for (const e of tr.effects) if (e.is(setZoom)) return e.value;
        if (pos === null) return null;
        if (tr.isUserEvent('outline.sync')) return null;
        if (!tr.docChanged) return pos;
        const mapped = tr.changes.mapPos(pos, -1);
        const line = tr.state.doc.lineAt(mapped);
        const outline = parseOutline(tr.state.doc.toString());
        return itemAtLine(outline, line.number - 1) >= 0 ? line.from : null;
    },
});

const zoomBounds = (state: EditorState, outline?: Outline) => {
    const pos = state.field(zoomField, false);
    if (pos === null || pos === undefined) return null;
    const o = outline ?? parseOutline(state.doc.toString());
    const line = state.doc.lineAt(pos).number - 1;
    const index = itemAtLine(o, line);
    if (index < 0) return null;
    const item = o.items[index];
    let end = item.end;
    while (end > item.line && o.lines[end].trim() === '') end--;
    return {
        line,
        from: pos,
        to: state.doc.line(end + 1).to,
    };
};

export const zoomRootLine = (state: EditorState) =>
    zoomBounds(state)?.line ?? null;

const hiddenByZoom = (state: EditorState): DecorationSet => {
    const bounds = zoomBounds(state);
    if (!bounds) return Decoration.none;
    const builder = new RangeSetBuilder<Decoration>();
    const hide = Decoration.replace({ block: true });
    if (bounds.from > 0) builder.add(0, bounds.from - 1, hide);
    builder.add(
        bounds.from,
        bounds.from,
        Decoration.line({ class: 'cm-outline-zoom-root' })
    );
    if (bounds.to < state.doc.length) {
        builder.add(bounds.to + 1, state.doc.length, hide);
    }
    return builder.finish();
};

const zoomDecorations = StateField.define<DecorationSet>({
    create: hiddenByZoom,
    update: (deco, tr) =>
        tr.docChanged ||
        tr.effects.some((e) => e.is(setZoom)) ||
        tr.startState.field(zoomField) !== tr.state.field(zoomField)
            ? hiddenByZoom(tr.state)
            : deco,
    provide: (f) => [
        EditorView.decorations.from(f),
        EditorView.atomicRanges.of((view) => view.state.field(f)),
    ],
});

// Zoomed in, nothing outside the zoomed item may change.
const zoomGuard = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.isUserEvent('outline.sync')) return tr;
    const bounds = zoomBounds(tr.startState);
    if (!bounds) return tr;
    let inside = true;
    tr.changes.iterChangedRanges((fromA, toA) => {
        if (fromA < bounds.from || toA > bounds.to) inside = false;
    });
    return inside ? tr : [];
});

// ---- folds --------------------------------------------------------------

export const isFolded = (state: EditorState, line: number) => {
    const end = state.doc.line(line + 1).to;
    let found = false;
    foldedRanges(state).between(end, end, (from) => {
        if (from === end) found = true;
    });
    return found;
};

const foldedKeys = (state: EditorState, outline: Outline) => {
    const keys = itemKeys(outline);
    const out: string[] = [];
    foldedRanges(state).between(0, state.doc.length, (from) => {
        const key = keys.get(state.doc.lineAt(from).number - 1);
        if (key) out.push(key);
    });
    return out;
};

// Folds the items whose keys are given (the others stay as they are).
export const foldKeys = (view: EditorView, wanted: string[]) => {
    if (wanted.length === 0) return;
    const doc = view.state.doc.toString();
    const outline = parseOutline(doc);
    const set = new Set(wanted);
    const effects: StateEffect<unknown>[] = [];
    for (const [line, key] of itemKeys(outline)) {
        if (!set.has(key) || isFolded(view.state, line)) continue;
        const range = foldRange(doc, line);
        if (range) effects.push(foldEffect.of(range));
    }
    if (effects.length) view.dispatch({ effects });
};

export const restoreFolds = (view: EditorView) => {
    const { storageKey } = view.state.facet(outlineConfig);
    if (storageKey) foldKeys(view, loadFolds(storageKey));
};

export const toggleFoldAt = (
    view: EditorView,
    line: number,
    fold?: boolean
) => {
    const range = foldRange(view.state.doc.toString(), line);
    if (!range) return false;
    const folded = isFolded(view.state, line);
    const want = fold ?? !folded;
    if (want === folded) return true;
    view.dispatch({
        effects: want ? foldEffect.of(range) : unfoldEffect.of(range),
    });
    return true;
};

const foldPersistence = EditorView.updateListener.of((update) => {
    const changedFolds = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
    );
    if (!changedFolds && !update.docChanged) return;
    const { storageKey } = update.state.facet(outlineConfig);
    if (!storageKey) return;
    if (!changedFolds && foldedRanges(update.state).size === 0) return;
    saveFolds(
        storageKey,
        foldedKeys(update.state, parseOutline(update.state.doc.toString()))
    );
});

class FoldCaretWidget extends WidgetType {
    constructor(readonly folded: boolean) {
        super();
    }
    eq(other: FoldCaretWidget) {
        return other.folded === this.folded;
    }
    toDOM() {
        const el = document.createElement('span');
        el.className = `cm-outline-fold${this.folded ? ' cm-outline-folded' : ''}`;
        el.setAttribute('aria-hidden', 'true');
        el.textContent = this.folded ? '▸' : '▾';
        return el;
    }
    ignoreEvent() {
        return true;
    }
}

const foldPlaceholder = codeFolding({
    placeholderDOM: (_view, onclick) => {
        const el = document.createElement('span');
        el.className = 'cm-outline-folded-more';
        el.textContent = '…';
        el.onclick = onclick;
        return el;
    },
});

// ---- line decorations: carets, continuation lines ------------------------

const LIST_INDENT_EM = 1.6;

function outlineLineDecorations(view: EditorView): DecorationSet {
    const { state } = view;
    const outline = parseOutline(state.doc.toString());
    const builder = new RangeSetBuilder<Decoration>();
    for (let n = 0; n < outline.lines.length; n++) {
        const line = state.doc.line(n + 1);
        if (
            !view.visibleRanges.some(
                (r) => r.from <= line.to && r.to >= line.from
            )
        ) {
            continue;
        }
        const index = outline.owner[n];
        if (index === null) continue;
        const item = outline.items[index];
        if (item.line === n) {
            if (foldRange(state.doc.toString(), n)) {
                builder.add(
                    line.from,
                    line.from,
                    Decoration.widget({
                        widget: new FoldCaretWidget(isFolded(state, n)),
                        side: -1,
                    })
                );
            }
            continue;
        }
        const text = outline.lines[n];
        if (outline.code[n] || text.trim() === '' || /^\s*(\||>)/.test(text)) {
            continue;
        }
        const ws = text.match(/^\s*/)![0].length;
        builder.add(
            line.from,
            line.from,
            Decoration.line({
                attributes: {
                    style: `padding-left: ${(item.depth + 1) * LIST_INDENT_EM}em`,
                },
            })
        );
        if (ws > 0) {
            builder.add(line.from, line.from + ws, Decoration.replace({}));
        }
    }
    return builder.finish();
}

const outlineLines = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
            this.decorations = outlineLineDecorations(view);
        }
        update(update: ViewUpdate) {
            const folds = update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
            );
            if (update.docChanged || update.viewportChanged || folds) {
                this.decorations = outlineLineDecorations(update.view);
            }
        }
    },
    {
        decorations: (p) => p.decorations,
        provide: (p) =>
            EditorView.atomicRanges.of(
                (view) => view.plugin(p)?.decorations ?? Decoration.none
            ),
    }
);

// ---- commands ------------------------------------------------------------

const selectionOf = (state: EditorState): TextSelection => {
    const { from, to } = state.selection.main;
    return { doc: state.doc.toString(), from, to };
};

const optionsOf = (state: EditorState): OutlineOptions => ({
    rootLine: zoomRootLine(state),
    folded: (line) => isFolded(state, line),
});

// Applies an outline edit; the items that were folded stay folded.
function apply(
    view: EditorView,
    command: (sel: TextSelection, options: OutlineOptions) => TextEdit | null
): boolean {
    const sel = selectionOf(view.state);
    const edit = command(sel, optionsOf(view.state));
    if (!edit) return false;
    if (isNoop(edit, sel)) return true;
    const kept = foldedKeys(view.state, parseOutline(sel.doc));
    view.dispatch({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
        selection: { anchor: edit.anchor, head: edit.head },
        scrollIntoView: true,
        userEvent: 'input',
    });
    foldKeys(view, kept);
    return true;
}

const caretLine = (state: EditorState) =>
    state.doc.lineAt(state.selection.main.head).number - 1;

// The item the caret is in (its first line), or null.
const caretItemLine = (state: EditorState) => {
    const outline = parseOutline(state.doc.toString());
    const owner = outline.owner[caretLine(state)];
    return owner === null || outline.code[caretLine(state)]
        ? null
        : outline.items[owner].line;
};

const onRoot = (state: EditorState) => {
    const root = zoomRootLine(state);
    return root !== null && caretItemLine(state) === root;
};

export function zoomTo(view: EditorView, line: number | null) {
    if (line === null) {
        view.dispatch({ effects: setZoom.of(null) });
        view.focus();
        return;
    }
    const target = view.state.doc.line(line + 1);
    // A folded item opens when zoomed into.
    toggleFoldAt(view, line, false);
    view.dispatch({
        effects: setZoom.of(target.from),
        selection: { anchor: target.to },
        scrollIntoView: true,
    });
    view.focus();
}

const zoomIn = (view: EditorView) => {
    const line = caretItemLine(view.state);
    if (line === null) return false;
    zoomTo(view, line);
    return true;
};

const zoomOut = (view: EditorView) => {
    const root = zoomRootLine(view.state);
    if (root === null) return false;
    const path = ancestorLines(parseOutline(view.state.doc.toString()), root);
    zoomTo(view, path.length > 1 ? path[path.length - 2] : null);
    return true;
};

const foldCommand = (fold: boolean) => (view: EditorView) => {
    const line = caretItemLine(view.state);
    if (line === null) return false;
    toggleFoldAt(view, line, fold);
    return true;
};

const makeTask = (view: EditorView) => {
    const { onMakeTask } = view.state.facet(outlineConfig);
    if (!onMakeTask || caretItemLine(view.state) === null) return false;
    onMakeTask(view, view.state.selection.main.head);
    return true;
};

const selectZoom = (view: EditorView) => {
    const bounds = zoomBounds(view.state);
    if (!bounds) return false;
    view.dispatch({ selection: { anchor: bounds.from, head: bounds.to } });
    return true;
};

export const outlineKeymap: KeyBinding[] = [
    { key: 'Enter', run: (v) => apply(v, splitItem) },
    { key: 'Shift-Enter', run: (v) => apply(v, (s) => softBreak(s)) },
    {
        key: 'Tab',
        run: (v) => (onRoot(v.state) ? true : apply(v, (s) => indentItems(s))),
    },
    {
        key: 'Shift-Tab',
        run: (v) => (onRoot(v.state) ? true : apply(v, outdentItems)),
    },
    { key: 'Backspace', run: (v) => apply(v, backspaceItem) },
    {
        key: 'Alt-ArrowUp',
        run: (v) => (onRoot(v.state) ? true : apply(v, (s) => moveItem(s, -1))),
    },
    {
        key: 'Alt-ArrowDown',
        run: (v) => (onRoot(v.state) ? true : apply(v, (s) => moveItem(s, 1))),
    },
    { key: 'Mod-ArrowUp', run: foldCommand(true) },
    { key: 'Mod-ArrowDown', run: foldCommand(false) },
    { key: 'Mod-.', run: zoomIn },
    { key: 'Mod-,', run: zoomOut },
    { key: 'Mod-Enter', run: (v) => apply(v, (s) => toggleItemBox(s)) },
    { key: 'Mod-Shift-t', run: makeTask },
    { key: 'Alt-Shift-t', run: makeTask },
    { key: 'Mod-a', run: selectZoom },
];

// ---- mouse ---------------------------------------------------------------

const lineOfElement = (view: EditorView, el: Element) => {
    const pos = view.posAtDOM(el);
    return view.state.doc.lineAt(pos).number - 1;
};

const BULLET_TARGET = '.cm-md-bullet, .cm-outline-fold, .cm-md-checkbox';

// Bullets and carets are widgets, whose events the editor ignores: they
// are listened to directly on the content.
const mouseHandlers = ViewPlugin.fromClass(
    class {
        constructor(readonly view: EditorView) {
            view.contentDOM.addEventListener('mousedown', this.down, true);
            view.contentDOM.addEventListener('contextmenu', this.menu, true);
        }
        down = (event: MouseEvent) => {
            const view = this.view;
            const target = event.target as HTMLElement;
            if (event.button !== 0) return;
            const caret = target.closest('.cm-outline-fold');
            if (caret) {
                event.preventDefault();
                event.stopPropagation();
                toggleFoldAt(view, lineOfElement(view, caret));
                return;
            }
            const bullet = target.closest('.cm-md-bullet');
            if (bullet && !target.closest('.cm-outline-zoom-root')) {
                event.preventDefault();
                event.stopPropagation();
                zoomTo(view, lineOfElement(view, bullet));
            }
        };
        menu = (event: MouseEvent) => {
            const view = this.view;
            const target = (event.target as HTMLElement).closest(BULLET_TARGET);
            const { onBulletMenu } = view.state.facet(outlineConfig);
            if (!target || !onBulletMenu) return;
            event.preventDefault();
            event.stopPropagation();
            onBulletMenu(
                view,
                lineOfElement(view, target),
                event.clientX,
                event.clientY
            );
        };
        destroy() {
            this.view.contentDOM.removeEventListener(
                'mousedown',
                this.down,
                true
            );
            this.view.contentDOM.removeEventListener(
                'contextmenu',
                this.menu,
                true
            );
        }
    }
);

// Typing on an empty top-level line starts a bullet.
const autoBulletInput = EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || view.composing) return false;
    const insert = autoBullet(view.state.doc.toString(), from, text);
    if (!insert) return false;
    view.dispatch({
        changes: { from, insert },
        selection: { anchor: from + insert.length },
        userEvent: 'input.type',
    });
    return true;
});

// Reports the zoom path to the page (breadcrumb).
const zoomReporter = EditorView.updateListener.of((update) => {
    const { onZoomChange } = update.state.facet(outlineConfig);
    if (!onZoomChange) return;
    const before = update.startState.field(zoomField);
    const after = update.state.field(zoomField);
    if (before === after && (after === null || !update.docChanged)) return;
    onZoomChange(zoomPath(update.state));
});

export const zoomPath = (state: EditorState): ZoomCrumb[] | null => {
    const root = zoomRootLine(state);
    if (root === null) return null;
    const outline = parseOutline(state.doc.toString());
    return ancestorLines(outline, root).map((line) => ({
        line,
        text: outline.items[itemAtLine(outline, line)].text,
    }));
};

const outlineTheme = EditorView.baseTheme({
    '.cm-outline-fold': {
        display: 'inline-block',
        position: 'relative',
        width: '0',
        left: '-1.1em',
        textIndent: '0',
        color: 'rgba(107, 114, 128, 0.9)',
        fontSize: '0.75em',
        cursor: 'pointer',
        userSelect: 'none',
        opacity: '0',
        transition: 'opacity 120ms ease-out',
    },
    '.cm-line:hover .cm-outline-fold, .cm-outline-fold.cm-outline-folded': {
        opacity: '1',
    },
    '.cm-md-bullet': { cursor: 'pointer' },
    '.cm-outline-folded-more': {
        marginLeft: '0.4em',
        padding: '0 0.35em',
        borderRadius: '0.5em',
        backgroundColor: 'rgba(107, 114, 128, 0.15)',
        cursor: 'pointer',
    },
    '.cm-outline-zoom-root': {
        fontSize: '1.35em',
        fontWeight: '600',
        paddingLeft: '0 !important',
        textIndent: '0 !important',
    },
    '.cm-outline-zoom-root .cm-md-bullet, .cm-outline-zoom-root .cm-outline-fold':
        { display: 'none' },
});

export const outlineExtension = (config: OutlineConfig = {}): Extension => [
    outlineMode.of(true),
    outlineConfig.of(config),
    Prec.highest(keymap.of(outlineKeymap)),
    zoomField,
    zoomDecorations,
    zoomGuard,
    foldPlaceholder,
    foldPersistence,
    outlineLines,
    mouseHandlers,
    autoBulletInput,
    zoomReporter,
    outlineTheme,
];

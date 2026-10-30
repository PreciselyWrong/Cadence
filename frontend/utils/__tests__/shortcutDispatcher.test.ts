import {
    createShortcutDispatcher,
    isEditableTarget,
    ShortcutBinding,
} from '../shortcutDispatcher';

const BINDINGS: ShortcutBinding[] = [
    { id: 'palette', keys: ['k'], mod: true, allowInField: true },
    { id: 'capture', keys: ['c'] },
    { id: 'search', keys: ['/'] },
    { id: 'help', keys: ['?'] },
    { id: 'go-today', keys: ['g', 't'] },
    { id: 'go-inbox', keys: ['g', 'i'] },
];

const press = (
    key: string,
    init: Partial<{
        ctrlKey: boolean;
        metaKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        target: EventTarget | null;
    }> = {}
) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: document.body as EventTarget | null,
    ...init,
});

describe('isEditableTarget', () => {
    it('treats inputs, textareas, selects and contenteditable as fields', () => {
        expect(isEditableTarget(document.createElement('input'))).toBe(true);
        expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
        expect(isEditableTarget(document.createElement('select'))).toBe(true);
        const editable = document.createElement('div');
        editable.setAttribute('contenteditable', 'true');
        document.body.appendChild(editable);
        expect(isEditableTarget(editable)).toBe(true);
        editable.remove();
    });

    it('treats a plain element and null as not editable', () => {
        expect(isEditableTarget(document.createElement('div'))).toBe(false);
        expect(isEditableTarget(null)).toBe(false);
    });

    it('treats anything inside a modal dialog as editable context', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('aria-modal', 'true');
        const button = document.createElement('button');
        dialog.appendChild(button);
        document.body.appendChild(dialog);
        expect(isEditableTarget(button)).toBe(true);
        dialog.remove();
    });
});

describe('createShortcutDispatcher', () => {
    it('fires a single-key binding outside fields', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        expect(dispatch(press('c'))?.id).toBe('capture');
        expect(dispatch(press('/'))?.id).toBe('search');
    });

    it('matches ? even though it needs Shift', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        expect(dispatch(press('?', { shiftKey: true }))?.id).toBe('help');
    });

    it('ignores single keys typed in a field', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        const input = document.createElement('input');
        expect(dispatch(press('c', { target: input }))).toBeNull();
        expect(dispatch(press('/', { target: input }))).toBeNull();
    });

    it('does not let a sequence start or continue inside a field', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        const input = document.createElement('input');
        dispatch(press('g', { target: input }));
        expect(dispatch(press('t'))).toBeNull();
    });

    it('lets a mod binding through in a field', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        const input = document.createElement('input');
        expect(dispatch(press('k', { ctrlKey: true, target: input }))?.id).toBe(
            'palette'
        );
        expect(dispatch(press('k', { metaKey: true, target: input }))?.id).toBe(
            'palette'
        );
    });

    it('ignores plain keys held with Ctrl, Meta or Alt', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        expect(dispatch(press('c', { ctrlKey: true }))).toBeNull();
        expect(dispatch(press('c', { metaKey: true }))).toBeNull();
        expect(dispatch(press('c', { altKey: true }))).toBeNull();
    });

    it('ignores an uppercase letter typed with Shift', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        expect(dispatch(press('C', { shiftKey: true }))).toBeNull();
    });

    it('resolves a two-key sequence', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        expect(dispatch(press('g'))).toBeNull();
        expect(dispatch(press('t'))?.id).toBe('go-today');
        expect(dispatch(press('g'))).toBeNull();
        expect(dispatch(press('i'))?.id).toBe('go-inbox');
    });

    it('drops a sequence that waits too long', () => {
        let clock = 0;
        const dispatch = createShortcutDispatcher(BINDINGS, {
            now: () => clock,
            sequenceTimeoutMs: 1000,
        });
        dispatch(press('g'));
        clock = 1500;
        expect(dispatch(press('t'))).toBeNull();
    });

    it('restarts from a key that does not continue the sequence', () => {
        const dispatch = createShortcutDispatcher(BINDINGS);
        dispatch(press('g'));
        expect(dispatch(press('c'))?.id).toBe('capture');
        expect(dispatch(press('t'))).toBeNull();
    });
});

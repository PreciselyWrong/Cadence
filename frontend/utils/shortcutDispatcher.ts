// Pure key matching for the global shortcuts: single keys ("c"), two-key
// sequences ("g" then "t") and Ctrl/Cmd chords, with the guard that keeps
// plain keys out of text fields and modal dialogs.

export interface ShortcutBinding {
    id: string;
    // One key, or a sequence pressed one after the other
    keys: string[];
    // Needs Ctrl (or Cmd on a Mac) held
    mod?: boolean;
    // Fires even while a text field has focus (chords only, in practice)
    allowInField?: boolean;
}

export interface KeyEventLike {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    target: EventTarget | null;
    isComposing?: boolean;
}

export const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    if (target.getAttribute('contenteditable') === 'true') return true;
    return !!target.closest('[aria-modal="true"]');
};

interface DispatcherOptions {
    sequenceTimeoutMs?: number;
    now?: () => number;
}

const keyOf = (event: KeyEventLike): string =>
    event.shiftKey && event.key.length === 1 && /[a-z]/i.test(event.key)
        ? event.key
        : event.key.toLowerCase();

const isPrefix = (prefix: string[], keys: string[]): boolean =>
    prefix.length < keys.length && prefix.every((key, i) => key === keys[i]);

export const createShortcutDispatcher = (
    bindings: ShortcutBinding[],
    { sequenceTimeoutMs = 1000, now = Date.now }: DispatcherOptions = {}
) => {
    let pending: string[] = [];
    let pendingAt = 0;

    const reset = () => {
        pending = [];
    };

    return (event: KeyEventLike): ShortcutBinding | null => {
        if (event.isComposing) return null;
        const inField = isEditableTarget(event.target);
        const modifier = event.ctrlKey || event.metaKey;
        const key = keyOf(event);

        if (modifier) {
            reset();
            if (event.altKey) return null;
            return (
                bindings.find(
                    (binding) =>
                        binding.mod &&
                        binding.keys.length === 1 &&
                        binding.keys[0] === key &&
                        (!inField || binding.allowInField)
                ) ?? null
            );
        }

        if (event.altKey || inField) {
            reset();
            return null;
        }

        const plain = bindings.filter((binding) => !binding.mod);
        const resolve = (
            sequence: string[]
        ): { binding?: ShortcutBinding; waiting: boolean } => ({
            binding: plain.find(
                (candidate) =>
                    candidate.keys.length === sequence.length &&
                    candidate.keys.every((k, i) => k === sequence[i])
            ),
            waiting: plain.some((candidate) =>
                isPrefix(sequence, candidate.keys)
            ),
        });
        const settle = (sequence: string[]) => {
            const outcome = resolve(sequence);
            if (outcome.binding) {
                reset();
                return outcome.binding;
            }
            if (outcome.waiting) {
                pending = sequence;
                pendingAt = now();
            }
            return null;
        };

        const continuing =
            pending.length > 0 && now() - pendingAt <= sequenceTimeoutMs;
        if (continuing) {
            const next = [...pending, key];
            const outcome = resolve(next);
            if (outcome.binding || outcome.waiting) return settle(next);
        }
        reset();
        return settle([key]);
    };
};

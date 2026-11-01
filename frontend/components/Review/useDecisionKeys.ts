import { useEffect } from 'react';
import { DecisionOption } from './DecisionChips';

interface DecisionKeys {
    options: DecisionOption[];
    onSkip?: () => void;
    onStop?: () => void;
    onOpen?: () => void;
    enabled?: boolean;
}

const typing = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable === true
    );
};

// Keyboard for one item at a time: 1–9 picks the choice with that number,
// S (or →) skips, O opens, Escape stops. Ignored while typing in a field and
// with Ctrl, Alt or Meta held, so the app's own shortcuts keep working.
export const useDecisionKeys = ({
    options,
    onSkip,
    onStop,
    onOpen,
    enabled = true,
}: DecisionKeys) => {
    useEffect(() => {
        if (!enabled) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.altKey || event.metaKey) return;
            if (typing(event.target)) return;
            const key = event.key.toLowerCase();
            if (/^[1-9]$/.test(key)) {
                const option = options[Number(key) - 1];
                // A choice that asks for a date needs the mouse or Tab.
                if (!option || option.date) return;
                event.preventDefault();
                option.run();
            } else if ((key === 's' || key === 'arrowright') && onSkip) {
                event.preventDefault();
                onSkip();
            } else if (key === 'o' && onOpen) {
                event.preventDefault();
                onOpen();
            } else if (key === 'escape' && onStop) {
                event.preventDefault();
                onStop();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [options, onSkip, onStop, onOpen, enabled]);
};

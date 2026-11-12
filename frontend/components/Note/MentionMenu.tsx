import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface MentionPerson {
    uid: string;
    name: string;
}

interface MentionMenuProps {
    x: number;
    y: number;
    filter: string;
    people: MentionPerson[] | null;
    onPick: (person: MentionPerson) => void;
    onClose: () => void;
}

const MAX_SHOWN = 8;

export const filterPeople = (people: MentionPerson[], filter: string) => {
    const q = filter.trim().toLowerCase();
    const named = people.filter((p) => p.name.toLowerCase().includes(q));
    // Names starting with the search come first.
    return named
        .sort(
            (a, b) =>
                Number(b.name.toLowerCase().startsWith(q)) -
                Number(a.name.toLowerCase().startsWith(q))
        )
        .slice(0, MAX_SHOWN);
};

// The people offered after typing "@" in an editor. Arrows move, Enter or
// Tab picks, Escape closes; typing keeps going to the editor.
const MentionMenu: React.FC<MentionMenuProps> = ({
    x,
    y,
    filter,
    people,
    onPick,
    onClose,
}) => {
    const { t } = useTranslation();
    const matches = people ? filterPeople(people, filter) : [];
    const [active, setActive] = useState(0);
    const index = Math.min(active, Math.max(0, matches.length - 1));
    const activeRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => setActive(0), [filter]);
    useEffect(() => {
        activeRef.current?.scrollIntoView?.({ block: 'nearest' });
    }, [index]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (matches.length === 0) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (i + 1) % matches.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (i - 1 + matches.length) % matches.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                onPick(matches[index]);
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [matches, index, onPick, onClose]);

    if (people && people.length === 0 && !filter) return null;

    const height = Math.min(Math.max(matches.length, 1), MAX_SHOWN) * 40;
    const top = window.innerHeight - y > height + 40 ? y + 22 : y - height - 8;

    return ReactDOM.createPortal(
        <div
            role="listbox"
            aria-label={t('editorToolbar.mention', 'Mention a person')}
            data-testid="mention-menu"
            className="fixed z-[300] max-h-80 min-w-[200px] max-w-xs overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
            style={{ left: x, top }}
            onMouseDown={(e) => e.preventDefault()}
        >
            {matches.length === 0 && (
                <div className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                    {people === null
                        ? t('mentions.loading', 'Loading people…')
                        : t('mentions.noMatch', 'No matching people')}
                </div>
            )}
            {matches.map((person, i) => (
                <button
                    key={person.uid}
                    ref={i === index ? activeRef : null}
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        i === index
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(person);
                    }}
                    onMouseEnter={() => setActive(i)}
                >
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        @
                    </span>
                    <span className="flex-1 truncate font-medium">
                        {person.name}
                    </span>
                </button>
            ))}
        </div>,
        document.body
    );
};

export default MentionMenu;

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LinkNoteProps {
    note: string | null;
    onSave: (note: string | null) => Promise<unknown>;
    // Inbox rows are clickable: keep clicks on the note inside it.
    stopPropagation?: boolean;
}

// The user's own words under a link. Click to write; Enter or leaving the
// field saves, Escape cancels, Shift+Enter starts a new line.
const LinkNote: React.FC<LinkNoteProps> = ({
    note,
    onSave,
    stopPropagation = false,
}) => {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(note ?? '');
    const field = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!editing) setDraft(note ?? '');
    }, [note, editing]);

    useEffect(() => {
        if (editing) field.current?.focus();
    }, [editing]);

    const stop = (event: React.SyntheticEvent) => {
        if (stopPropagation) event.stopPropagation();
    };

    const commit = async () => {
        setEditing(false);
        const next = draft.trim();
        if (next === (note ?? '')) return;
        try {
            await onSave(next || null);
        } catch {
            setDraft(note ?? '');
        }
    };

    if (editing) {
        return (
            <textarea
                ref={field}
                value={draft}
                rows={2}
                onClick={stop}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commit()}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void commit();
                    } else if (e.key === 'Escape') {
                        setDraft(note ?? '');
                        setEditing(false);
                    }
                }}
                aria-label={t('links.note', 'Your note')}
                placeholder={t('links.notePlaceholder', 'Why you saved it…')}
                className="w-full resize-y rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:text-gray-200"
            />
        );
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                stop(e);
                setEditing(true);
            }}
            onKeyDown={stop}
            className={`w-full rounded-md text-left text-[13px] leading-snug break-words whitespace-pre-line ${
                note
                    ? 'text-gray-800 dark:text-gray-200'
                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
        >
            {note || t('links.addNote', 'Add a note')}
        </button>
    );
};

export default LinkNote;

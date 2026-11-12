import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LockClosedIcon, PlusIcon } from '@heroicons/react/24/outline';
import { createNote } from '../../utils/notesService';
import { createTask } from '../../utils/tasksService';
import { openTaskPanel } from '../../store/taskPanelStore';
import { useStore } from '../../store/useStore';
import { Task } from '../../entities/Task';

// The badge sits on the text's baseline: the outer flex row takes its
// baseline from the title (the label stretches and the lock centers, so
// neither takes part), which lines it up with the words around it.
export const LinkBadge: React.FC<{
    label: string;
    title: string;
    locked?: boolean;
    missing?: boolean;
}> = ({ label, title, locked = false, missing = false }) => (
    <span
        className={`inline-flex items-baseline align-baseline rounded overflow-hidden mx-0.5 leading-snug ${
            missing
                ? 'border border-dashed border-gray-300 dark:border-gray-600 opacity-70'
                : ''
        }`}
    >
        <span className="self-stretch flex items-center px-1.5 text-[0.72em] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 bg-gray-200/80 dark:bg-gray-700/80">
            {missing ? <PlusIcon className="h-3 w-3" /> : `${label}:`}
        </span>
        <span
            className={`inline-flex items-baseline gap-1 px-1.5 py-px text-[0.9em] bg-gray-100 dark:bg-gray-800 ${
                missing
                    ? 'text-gray-500 dark:text-gray-400 italic'
                    : 'text-gray-800 dark:text-gray-200'
            }`}
        >
            {locked && <LockClosedIcon className="h-3 w-3 self-center" />}
            {title}
        </span>
    </span>
);

export const NoteBadge: React.FC<{ title: string; locked?: boolean }> = ({
    title,
    locked,
}) => <LinkBadge label="NOTE" title={title} locked={locked} />;

// A [[link]] to a note or task that does not exist yet: clicking creates
// it with that title and opens it.
export const MissingLinkButton: React.FC<{
    type: 'note' | 'task';
    title: string;
    onCreated?: (uid: string) => void;
}> = ({ type, title, onCreated }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const addNote = useStore((state) => state.notesStore.addNote);
    const [busy, setBusy] = useState(false);
    const label =
        type === 'note'
            ? t('contentLinks.createNote', 'Create note "{{title}}"', { title })
            : t('contentLinks.createTask', 'Create task "{{title}}"', {
                  title,
              });

    const create = async (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
            if (type === 'note') {
                const note = await createNote({ title, content: '' });
                addNote?.(note);
                if (note.uid) navigate(`/notes/${note.uid}`);
            } else {
                const task = await createTask({ name: title } as Task);
                if (task.uid) {
                    onCreated?.(task.uid);
                    openTaskPanel(task.uid);
                }
            }
        } catch {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            className="cursor-pointer align-baseline"
            title={label}
            aria-label={label}
            data-testid={`missing-${type}-link`}
            disabled={busy}
            onClick={create}
        >
            <LinkBadge
                label={type === 'note' ? 'NOTE' : 'TASK'}
                title={title}
                missing
            />
        </button>
    );
};

export const MentionChip: React.FC<{
    uid: string;
    name: React.ReactNode;
    asLink?: boolean;
}> = ({ uid, name, asLink = true }) => {
    const chip = (
        <span className="inline-flex items-baseline rounded-full bg-indigo-50 px-1.5 text-[0.95em] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
            @{name}
        </span>
    );
    return asLink ? (
        <Link
            to={`/person/${uid}`}
            className="!no-underline hover:!no-underline"
            data-testid="mention-chip"
        >
            {chip}
        </Link>
    ) : (
        chip
    );
};

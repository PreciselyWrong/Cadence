import React from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { Note } from '../../entities/Note';
import ListRow, { ColorDot } from './ui/ListRow';
import { useSidebarDrop } from '../Sidebar/sidebarDrop';

// The first words of a note, without Markdown marks, for its row.
export const noteSnippet = (content?: string | null): string =>
    (content ?? '')
        .split('\n')
        .map((line) =>
            line
                .replace(
                    /^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|>\s*|\d+\.\s+)/,
                    ''
                )
                .replace(/[*_`~]|\[\[|\]\]/g, '')
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
                .trim()
        )
        .find((line) => line.length > 0) ?? '';

export const notePath = (note: Note): string => {
    const id = note.uid ?? (note.id !== undefined ? String(note.id) : 'note');
    const slug = (note.title ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `/note/${id}-${slug}`;
};

/**
 * One note in a list: its colour (or a note icon), the title, then its first
 * line and project in grey. Drags onto a sidebar project or tag like a card.
 */
const NoteRow: React.FC<{ note: Note }> = ({ note }) => {
    const { t } = useTranslation();
    const { nativeSource } = useSidebarDrop();
    const project = note.project || note.Project;
    const meta = [noteSnippet(note.content), project?.name]
        .filter(Boolean)
        .join(' · ');

    return (
        <div {...nativeSource({ kind: 'note', note })}>
            <ListRow
                to={notePath(note)}
                testId={`note-row-${note.uid}`}
                leading={
                    note.color ? (
                        <ColorDot color={note.color} />
                    ) : (
                        <DocumentTextIcon className="h-4 w-4" />
                    )
                }
                title={note.title || t('notes.untitled', 'Untitled Note')}
                meta={meta || undefined}
            />
        </div>
    );
};

export default NoteRow;

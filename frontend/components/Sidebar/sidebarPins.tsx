import React from 'react';
import { useTranslation } from 'react-i18next';
import PushPinIcon from '../Shared/Icons/PushPinIcon';
import { useStore } from '../../store/useStore';
import { updateProject } from '../../utils/projectsService';
import { updateNote } from '../../utils/notesService';
import { updateTag } from '../../utils/tagsService';
import { Project } from '../../entities/Project';
import { Note } from '../../entities/Note';
import { Tag } from '../../entities/Tag';

// Pinning updates the store first so the item moves to the top of the
// sidebar at once, and puts it back if the server refuses.
export const useProjectPin = () => {
    const projects = useStore((state) => state.projectsStore.projects);
    const setProjects = useStore((state) => state.projectsStore.setProjects);
    return async (project: Project, pinned: boolean) => {
        if (!project.uid) return;
        const withPin = (value: boolean) =>
            projects.map((p) =>
                p.uid === project.uid ? { ...p, pin_to_sidebar: value } : p
            );
        setProjects(withPin(pinned));
        try {
            await updateProject(project.uid, { pin_to_sidebar: pinned });
        } catch {
            setProjects(withPin(!pinned));
        }
    };
};

export const useNotePin = () => {
    const notes = useStore((state) => state.notesStore.notes);
    const setNotes = useStore((state) => state.notesStore.setNotes);
    return async (note: Note, pinned: boolean) => {
        if (!note.uid) return;
        const withPin = (value: boolean) =>
            notes.map((n) =>
                n.uid === note.uid ? { ...n, pin_to_sidebar: value } : n
            );
        setNotes(withPin(pinned));
        try {
            await updateNote(note.uid, { ...note, pin_to_sidebar: pinned });
        } catch {
            setNotes(withPin(!pinned));
        }
    };
};

export const useTagPin = () => {
    const tags = useStore((state) => state.tagsStore.tags);
    const setTags = useStore((state) => state.tagsStore.setTags);
    return async (tag: Tag, pinned: boolean) => {
        if (!tag.uid) return;
        const withPin = (value: boolean) =>
            tags.map((t) => (t.uid === tag.uid ? { ...t, pinned: value } : t));
        setTags(withPin(pinned));
        try {
            await updateTag(tag.uid, { ...tag, pinned });
        } catch {
            setTags(withPin(!pinned));
        }
    };
};

interface SidebarPinButtonProps {
    name: string;
    pinned: boolean;
    onToggle: (pinned: boolean) => void;
}

// Shown on hover (always on touch screens) so pinning is one click away
// from any row.
export const SidebarPinButton: React.FC<SidebarPinButtonProps> = ({
    name,
    pinned,
    onToggle,
}) => {
    const { t } = useTranslation();
    const label = pinned
        ? t('sidebar.unpinItem', 'Unpin {{name}}', { name })
        : t('sidebar.pinItem', 'Pin {{name}}', { name });
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onToggle(!pinned);
            }}
            className="flex-shrink-0 ml-1 text-gray-400 dark:text-gray-500 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:text-gray-900 dark:hover:text-white"
            aria-label={label}
            title={label}
        >
            <PushPinIcon className="h-3.5 w-3.5" filled={pinned} />
        </button>
    );
};

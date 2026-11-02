import React from 'react';
import { Location } from 'react-router-dom';
import {
    FolderIcon,
    BookOpenIcon,
    TagIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import PushPinIcon from '../Shared/Icons/PushPinIcon';
import EntityIcon from '../Shared/EntityIcon';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { createNoteUrl, createTagUrl } from '../../utils/slugUtils';
import { resolveColor } from '../../constants/colorPalette';
import { resolveTagColor } from '../../utils/tagColor';
import { Project } from '../../entities/Project';
import { Note } from '../../entities/Note';
import { Tag } from '../../entities/Tag';
import { useNotePin, useProjectPin, useTagPin } from './sidebarPins';

interface SidebarBookmarksProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
}

const getProjectPath = (project: Project) => {
    const slug = project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `/project/${project.uid}-${slug}`;
};

const getNotePath = (note: Note) => {
    try {
        return createNoteUrl(note);
    } catch {
        return '/notes';
    }
};

const getTagPath = (tag: Tag) => {
    try {
        return createTagUrl(tag);
    } catch {
        return '/tags';
    }
};

interface PinnedRowProps {
    name: string;
    active: boolean;
    icon: React.ReactNode;
    onOpen: () => void;
    onUnpin: () => void;
}

const PinnedRow: React.FC<PinnedRowProps> = ({
    name,
    active,
    icon,
    onOpen,
    onUnpin,
}) => {
    const { t } = useTranslation();
    const label = t('sidebar.unpinItem', 'Unpin {{name}}', { name });
    return (
        <div
            className={`group flex items-center gap-2 rounded-[8px] px-[10px] py-[6px] text-[14px] font-medium cursor-pointer text-gray-900 dark:text-white hover:bg-white dark:hover:bg-white/10 ${
                active ? 'bg-white dark:bg-white/10' : ''
            }`}
            onClick={onOpen}
        >
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                {icon}
            </span>
            <span className="truncate min-w-0 flex-1">{name}</span>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onUnpin();
                }}
                className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label={label}
                title={label}
            >
                <XMarkIcon className="h-3.5 w-3.5" />
            </button>
        </div>
    );
};

// Pinned projects, notes and tags, always open at the very top of the
// sidebar so they are one click away, like pinned lists in TickTick.
const SidebarBookmarks: React.FC<SidebarBookmarksProps> = ({
    handleNavClick,
    location,
}) => {
    const { t } = useTranslation();

    const projects = useStore((state) => state.projectsStore.projects);
    const notes = useStore((state) => state.notesStore.notes);
    const tags = useStore((state) => state.tagsStore.tags);
    const pinProject = useProjectPin();
    const pinNote = useNotePin();
    const pinTag = useTagPin();

    const pinnedProjects = projects.filter((p) => p.pin_to_sidebar);
    const pinnedNotes = notes.filter((n) => n.pin_to_sidebar);
    const pinnedTags = tags.filter((t) => t.pinned);

    if (
        pinnedProjects.length === 0 &&
        pinnedNotes.length === 0 &&
        pinnedTags.length === 0
    ) {
        return null;
    }

    const isActive = (path: string) => location.pathname === path;

    return (
        <section
            aria-label={t('sidebar.pinned', 'Pinned')}
            className="flex flex-col gap-0.5 rounded-xl bg-gray-100/80 dark:bg-white/5 p-1"
        >
            <span className="flex items-center gap-[6px] px-[10px] pt-[4px] pb-[2px] text-[12px] tracking-[0.01em] font-semibold uppercase text-gray-500 dark:text-gray-400">
                <PushPinIcon className="h-[13px] w-[13px]" filled />
                {t('sidebar.pinned', 'Pinned')}
            </span>
            {pinnedProjects.map((project) => {
                const path = getProjectPath(project);
                const color = resolveColor(project.color)?.value;
                return (
                    <PinnedRow
                        key={project.uid}
                        name={project.name}
                        active={isActive(path)}
                        icon={
                            <span style={color ? { color } : undefined}>
                                <EntityIcon
                                    icon={project.icon}
                                    className="h-4 w-4"
                                    fallback={
                                        <FolderIcon className="h-4 w-4" />
                                    }
                                />
                            </span>
                        }
                        onOpen={() =>
                            handleNavClick(
                                path,
                                project.name,
                                <FolderIcon className="h-4 w-4 mr-2" />
                            )
                        }
                        onUnpin={() => pinProject(project, false)}
                    />
                );
            })}
            {pinnedNotes.map((note) => {
                const path = getNotePath(note);
                return (
                    <PinnedRow
                        key={note.uid || note.id}
                        name={note.title}
                        active={isActive(path)}
                        icon={
                            <BookOpenIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        }
                        onOpen={() =>
                            handleNavClick(
                                path,
                                note.title,
                                <BookOpenIcon className="h-4 w-4 mr-2" />
                            )
                        }
                        onUnpin={() => pinNote(note, false)}
                    />
                );
            })}
            {pinnedTags.map((tag) => {
                const path = getTagPath(tag);
                return (
                    <PinnedRow
                        key={tag.uid || tag.id}
                        name={tag.name}
                        active={isActive(path)}
                        icon={
                            <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                    backgroundColor: resolveTagColor(tag, tags)
                                        .value,
                                }}
                            />
                        }
                        onOpen={() =>
                            handleNavClick(
                                path,
                                tag.name,
                                <TagIcon className="h-4 w-4 mr-2" />
                            )
                        }
                        onUnpin={() => pinTag(tag, false)}
                    />
                );
            })}
        </section>
    );
};

export default SidebarBookmarks;

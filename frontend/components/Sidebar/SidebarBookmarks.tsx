import React, { useRef } from 'react';
import { Location } from 'react-router-dom';
import {
    FolderIcon,
    BookOpenIcon,
    TagIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
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
import Menu from '../Shared/ui/Menu';
import { tint } from '../DailyPlan/planUtils';

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

interface PinnedTileProps {
    name: string;
    active: boolean;
    icon: React.ReactNode;
    // The entity's colour (#rrggbb): tints the icon tile.
    color?: string | null;
    onOpen: () => void;
    onUnpin: () => void;
}

// One pinned item as a tile, a large icon over its name (TickTick's pinned
// lists). Nothing shows on hover: a right click (or the menu key on the
// hidden trigger) offers Unpin.
const PinnedTile: React.FC<PinnedTileProps> = ({
    name,
    active,
    icon,
    color,
    onOpen,
    onUnpin,
}) => {
    const { t } = useTranslation();
    const trigger = useRef<HTMLButtonElement | null>(null);
    const label = t('sidebar.unpinItem', 'Unpin {{name}}', { name });
    // On the dark island a 24% tint of a dark colour vanished: the tile is
    // lighter there, and the icon takes a lightened tint of the colour.
    const fill = tint(color, 0.32);
    const ink = color ? `color-mix(in srgb, ${color} 55%, white)` : undefined;
    return (
        <div
            className="relative w-1/4 min-w-0 px-px"
            onContextMenu={(event) => {
                event.preventDefault();
                trigger.current?.click();
            }}
        >
            <button
                type="button"
                onClick={onOpen}
                title={name}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 pb-1 pt-1.5 ${
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
            >
                <span
                    aria-hidden="true"
                    className={`grid h-8 w-8 place-items-center rounded-lg [&>*]:h-[18px] [&>*]:w-[18px] ${
                        fill ? '' : 'bg-surface-high text-surface-on'
                    }`}
                    style={
                        fill
                            ? {
                                  backgroundColor: fill,
                                  color: ink,
                              }
                            : undefined
                    }
                >
                    {icon}
                </span>
                <span className="w-full truncate text-center text-xs text-surface-on">
                    {name}
                </span>
            </button>
            <Menu
                entries={[
                    {
                        key: 'unpin',
                        label,
                        icon: <XMarkIcon />,
                        onSelect: onUnpin,
                    },
                ]}
                align="start"
                trigger={(triggerProps) => (
                    <button
                        {...triggerProps}
                        ref={(node) => {
                            trigger.current = node;
                            const forward = triggerProps.ref;
                            if (typeof forward === 'function') forward(node);
                            else if (forward)
                                (
                                    forward as React.MutableRefObject<HTMLButtonElement | null>
                                ).current = node;
                        }}
                        type="button"
                        aria-label={label}
                        className="sr-only focus:not-sr-only focus:absolute focus:right-0 focus:top-0 focus:rounded focus:bg-surface-high focus:p-0.5 focus:text-xs"
                    >
                        ⋯
                    </button>
                )}
            />
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
            className="flex flex-wrap justify-center gap-y-0.5 px-1"
        >
            {pinnedProjects.map((project) => {
                const path = getProjectPath(project);
                const color = resolveColor(project.color)?.value;
                return (
                    <PinnedTile
                        key={project.uid}
                        name={project.name}
                        active={isActive(path)}
                        color={color}
                        icon={
                            <EntityIcon
                                icon={project.icon}
                                className="h-[18px] w-[18px]"
                                fallback={<FolderIcon />}
                            />
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
                    <PinnedTile
                        key={note.uid || note.id}
                        name={note.title}
                        active={isActive(path)}
                        icon={<BookOpenIcon />}
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
                    <PinnedTile
                        key={tag.uid || tag.id}
                        name={tag.name}
                        active={isActive(path)}
                        color={resolveTagColor(tag, tags).value}
                        icon={<TagIcon />}
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

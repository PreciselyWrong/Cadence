import AutoClassifiedMark from '../AutoClassify/AutoClassifiedMark';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    PencilIcon,
    TrashIcon,
    FolderIcon,
    TagIcon as TagIconOutline,
    ClockIcon,
    EllipsisVerticalIcon,
    XMarkIcon,
    ArrowsPointingOutIcon,
    GlobeAltIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/outline';
import PushPinIcon from '../Shared/Icons/PushPinIcon';
import TagInput from '../Tag/TagInput';
import { Note } from '../../entities/Note';
import { useStore } from '../../store/useStore';
import { COLORS } from '../Shared/ColorPicker';
import NoteBackgroundPicker from './NoteBackgroundPicker';
import LinkPreviews from '../Links/LinkPreviews';
import MarkdownEditor from './MarkdownEditor';
import Backlinks from '../Shared/Backlinks';
import { FORM } from '../../constants/formClasses';
import { PAGE_TITLE_CLASS } from '../Shared/ui/PageHeader';
import { PAGE_GUTTER } from '../Shared/ui/PageShell';

export const shouldUseLightText = (hexColor: string | undefined): boolean => {
    if (!hexColor) return false;
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
};

// Today's edits show the time, older ones the date.
export const formatEditedAt = (updatedAt: string, now = new Date()): string => {
    const date = new Date(updatedAt);
    return date.toDateString() === now.toDateString()
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString();
};

interface NoteEditorViewProps {
    note: Note;
    saveStatus: 'saved' | 'saving' | 'unsaved';
    onChange: (updates: Partial<Note>) => void;
    onLookChange: (changes: Pick<Note, 'color' | 'background'>) => void;
    onSaveNow: () => void;
    onTogglePin: () => void;
    onDelete: () => void;
    onShare: () => void;
    onOpenFocusMode: () => void;
    // Leaves the note for the overview of all notes (Notes page only).
    onShowAll?: () => void;
    // Extra buttons after the note options, e.g. close in a side panel
    headerActions?: React.ReactNode;
}

// The open note as the Notes page shows it: title, date, project and tags,
// note options and the editor. Shared by the Notes page and the note side
// panel on project pages.
const NoteEditorView: React.FC<NoteEditorViewProps> = ({
    note,
    saveStatus,
    onChange,
    onLookChange,
    onSaveNow,
    onTogglePin,
    onDelete,
    onShare,
    onOpenFocusMode,
    onShowAll,
    headerActions,
}) => {
    const { t } = useTranslation();
    const projects = useStore((state) => state.projectsStore.projects);
    const noteProjectUid = note.project_uid || note.project?.uid;
    const projectColor = noteProjectUid
        ? projects.find((p) => p.uid === noteProjectUid)?.color
        : undefined;
    const [showProjectPicker, setShowProjectPicker] = useState(false);
    const [showTagsInput, setShowTagsInput] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const optionsRef = useRef<HTMLDivElement>(null);
    const noteColor = note.color;

    // Pickers belong to one note; switching notes closes them.
    useEffect(() => {
        setShowProjectPicker(false);
        setShowTagsInput(false);
        setShowOptions(false);
    }, [note.uid]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                optionsRef.current &&
                !optionsRef.current.contains(event.target as Node)
            ) {
                setShowOptions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleProjectPicker = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setShowProjectPicker((prev) => !prev);
        setShowTagsInput(false);
    };

    const toggleTagsInput = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setShowTagsInput((prev) => !prev);
        setShowProjectPicker(false);
    };

    // Text on a coloured note follows the colour, not the theme.
    const lightInk = noteColor ? shouldUseLightText(noteColor) : null;
    const titleInk =
        lightInk === null ? '' : lightInk ? 'text-white' : 'text-black/80';
    const mutedInk =
        lightInk === null
            ? 'text-surface-on-variant'
            : lightInk
              ? 'text-white/80'
              : 'text-black/70';

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div
                className={`mb-3 flex flex-shrink-0 items-start justify-between pt-5 ${PAGE_GUTTER}`}
            >
                <div className="flex-1">
                    <input
                        type="text"
                        value={note.title || ''}
                        onChange={(e) =>
                            onChange({
                                title: e.target.value,
                            })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder={t('notes.titlePlaceholder')}
                        // The page title type of every page, still editable.
                        className={`mb-4 block w-full border-none bg-transparent px-0 pt-5 focus:outline-none focus:ring-0 ${PAGE_TITLE_CLASS} ${titleInk}`}
                        autoFocus={!note.uid}
                    />
                    <div
                        className={`mb-2 flex flex-col space-y-1 text-xs ${mutedInk}`}
                    >
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center">
                                <ClockIcon className="h-3 w-3 mr-1" />
                                <span>
                                    {note.updated_at
                                        ? formatEditedAt(note.updated_at)
                                        : 'New'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={toggleProjectPicker}
                                className="flex items-center hover:underline text-left"
                                title={
                                    note.project
                                        ? undefined
                                        : t(
                                              'projects.addProject',
                                              'Add project'
                                          )
                                }
                            >
                                {projectColor ? (
                                    <span
                                        aria-hidden="true"
                                        className="h-2 w-2 mr-1.5 rounded-[3px] flex-shrink-0"
                                        style={{
                                            backgroundColor: projectColor,
                                        }}
                                    />
                                ) : (
                                    <FolderIcon className="h-3 w-3 mr-1" />
                                )}
                                {note.project
                                    ? note.project.name
                                    : t('projects.addProject', 'Add project')}
                            </button>
                            <button
                                type="button"
                                onClick={toggleTagsInput}
                                className="flex items-center hover:underline text-left"
                                title={
                                    note.tags && note.tags.length > 0
                                        ? undefined
                                        : t('project.addTags', 'Add tags')
                                }
                            >
                                <TagIconOutline className="h-3 w-3 mr-1" />
                                <span>
                                    {note.tags && note.tags.length > 0
                                        ? note.tags.map((tag, idx) => (
                                              <React.Fragment key={idx}>
                                                  {idx > 0 && ', '}
                                                  {tag.name}
                                              </React.Fragment>
                                          ))
                                        : t('project.addTags', 'Add tags')}
                                </span>
                            </button>
                        </div>
                        {note.title && (
                            <div className="flex items-center">
                                {saveStatus === 'saving' && (
                                    <span className="text-blue-500 dark:text-blue-400 italic">
                                        {t('common.saving', 'Saving...')}
                                    </span>
                                )}
                                {saveStatus === 'saved' && (
                                    <span className="text-green-600 dark:text-green-400">
                                        ✓ {t('notes.saved', 'Saved')}
                                    </span>
                                )}
                                {saveStatus === 'unsaved' && (
                                    <span className="text-amber-600 dark:text-amber-400">
                                        •{' '}
                                        {t('notes.unsaved', 'Unsaved changes')}
                                    </span>
                                )}
                            </div>
                        )}
                        {saveStatus === 'saved' && (
                            <AutoClassifiedMark entity="note" uid={note.uid} />
                        )}
                    </div>
                </div>
                <div className="flex items-center">
                    <button
                        onClick={onOpenFocusMode}
                        className={`p-2 transition-colors hover:text-primary ${mutedInk}`}
                        aria-label={t('notes.focusMode')}
                        title={t('notes.focusMode')}
                    >
                        <ArrowsPointingOutIcon className="h-5 w-5" />
                    </button>
                    {note.uid && (
                        <button
                            onClick={() => onShare()}
                            className={`p-2 transition ${
                                note.is_public
                                    ? 'text-success'
                                    : `opacity-60 hover:opacity-100 ${mutedInk}`
                            }`}
                            aria-label={t(
                                'notes.publicShare.open',
                                'Share note'
                            )}
                            title={
                                note.is_public
                                    ? t(
                                          'notes.publicShare.sharedTitle',
                                          'Shared with anyone who has the link'
                                      )
                                    : t('notes.publicShare.open', 'Share note')
                            }
                            data-testid="note-share-button"
                        >
                            <GlobeAltIcon className="h-5 w-5" />
                        </button>
                    )}
                    <div className="relative" ref={optionsRef}>
                        <button
                            onClick={() => setShowOptions(!showOptions)}
                            className={`p-2 transition-colors hover:text-primary ${mutedInk}`}
                            aria-label={t('notes.noteOptions')}
                        >
                            <EllipsisVerticalIcon className="h-5 w-5" />
                        </button>
                        {showOptions && (
                            <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                                <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700">
                                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                                        {t(
                                            'notes.backgroundColor',
                                            'Background color'
                                        )}
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                        {COLORS.map((colorOption) => (
                                            <button
                                                key={colorOption.value}
                                                onClick={() =>
                                                    onLookChange({
                                                        color: colorOption.value,
                                                    })
                                                }
                                                className={`w-8 h-8 rounded-md border-2 transition-all hover:scale-110 flex items-center justify-center ${
                                                    note.color ===
                                                    colorOption.value
                                                        ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
                                                        : 'border-gray-300 dark:border-gray-600'
                                                }`}
                                                style={{
                                                    backgroundColor:
                                                        colorOption.value ||
                                                        '#ffffff',
                                                }}
                                                title={colorOption.name}
                                                aria-label={`Set background to ${colorOption.name}`}
                                            >
                                                {!colorOption.value && (
                                                    <XMarkIcon className="h-5 w-5 text-gray-500" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mt-3 mb-2">
                                        {t(
                                            'notes.backgroundImage',
                                            'Background'
                                        )}
                                    </div>
                                    <NoteBackgroundPicker
                                        value={note.background}
                                        onChange={(bg) =>
                                            onLookChange({ background: bg })
                                        }
                                    />
                                </div>
                                <div className="py-1">
                                    {onShowAll && (
                                        <button
                                            onClick={() => {
                                                setShowOptions(false);
                                                onShowAll();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        >
                                            <Squares2X2Icon className="h-4 w-4" />
                                            {t('notes.allNotes', 'All notes')}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            onSaveNow();
                                            setShowOptions(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <PencilIcon className="h-4 w-4" />
                                        {t('notes.save', 'Save')}
                                    </button>
                                    {note.uid && (
                                        <button
                                            onClick={() => {
                                                onTogglePin();
                                                setShowOptions(false);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        >
                                            <PushPinIcon className="h-4 w-4" />
                                            {note.pin_to_sidebar
                                                ? t(
                                                      'notes.unpinFromSidebar',
                                                      'Unpin from sidebar'
                                                  )
                                                : t(
                                                      'notes.pinToSidebar',
                                                      'Pin to sidebar'
                                                  )}
                                        </button>
                                    )}
                                    {note.uid && (
                                        <button
                                            onClick={() => {
                                                onDelete();
                                                setShowOptions(false);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                            {t('notes.delete', 'Delete')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    {headerActions}
                </div>
            </div>

            {showProjectPicker && (
                <div className="mb-3 mx-4 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('notes.selectProject', 'Select project')}
                    </label>
                    <select
                        value={note.project_uid || ''}
                        onChange={(e) => {
                            const projectUid = e.target.value || null;
                            const selectedProject = projectUid
                                ? projects.find((p) => p.uid === projectUid)
                                : undefined;
                            onChange({
                                project_uid: projectUid,
                                project: selectedProject as any,
                            });
                            setShowProjectPicker(false);
                        }}
                        className={`${FORM.select} w-full`}
                    >
                        <option value="">No Project</option>
                        {projects.map((project) => (
                            <option key={project.uid} value={project.uid}>
                                {project.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {showTagsInput && (
                <div className="mb-3 mx-4 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('forms.tags', 'Tags')}
                    </label>
                    <TagInput
                        initialTags={(note.tags || note.Tags || []).map(
                            (t: any) => t.name
                        )}
                        onTagsChange={(tagNames: string[]) => {
                            onChange({
                                tags: tagNames.map((name: string) => ({
                                    name,
                                })),
                            });
                        }}
                        availableTags={useStore.getState().tagsStore.getTags()}
                    />
                </div>
            )}

            {/* The editor keeps a 24px gutter for the block
                handle, so its text lines up with the title. */}
            {/* A flex column: the editor fills it, so its toolbar sits on the
                bottom edge instead of under a short note. */}
            <div className="flex flex-1 flex-col overflow-y-auto py-4 pl-0 pr-6">
                <MarkdownEditor
                    className="flex-1"
                    noteUid={note.uid}
                    outlineKey={note.uid ? `note:${note.uid}` : undefined}
                    taskProjectId={
                        note.project?.id ?? note.Project?.id ?? note.project_id
                    }
                    value={note.content || ''}
                    onChange={(val) => onChange({ content: val })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={t('notes.contentPlaceholder')}
                    noteColor={noteColor}
                    minHeight="300px"
                />
            </div>
            {note.uid && (
                <Backlinks
                    type="note"
                    uid={note.uid}
                    className="mx-2 mb-3 flex-shrink-0 md:mx-4"
                />
            )}
            {note.uid && (
                <div className="mx-4 mb-3 flex-shrink-0">
                    <LinkPreviews texts={[note.content]} />
                </div>
            )}
        </div>
    );
};

export default NoteEditorView;

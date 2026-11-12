import React from 'react';
import { useTagColor } from '../../utils/tagColor';
import { TFunction } from 'i18next';
import {
    MagnifyingGlassIcon,
    PencilSquareIcon,
    TagIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { Tag } from '../../entities/Tag';
import PushPinIcon from '../Shared/Icons/PushPinIcon';

interface TagHeroProps {
    tag: Tag;
    t: TFunction;
    tasksCount: number;
    notesCount: number;
    projectsCount: number;
    editButtonRef: React.RefObject<HTMLButtonElement>;
    onSearchToggle: () => void;
    onTogglePin: () => void;
    onDeleteClick: () => void;
}

// Same card as the goal, area and project headers: tinted surface, icon
// tile, title and outlined actions. No progress bar: a tag is not a goal.
const TagHero: React.FC<TagHeroProps> = ({
    tag,
    t,
    tasksCount,
    notesCount,
    projectsCount,
    editButtonRef,
    onSearchToggle,
    onTogglePin,
    onDeleteClick,
}) => {
    const tagColor = useTagColor();
    const isSystem = tag.tag_type === 'system';
    const tint = tagColor(tag).value;
    const actionClass =
        'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-body-m font-medium text-surface-on ring-1 ring-inset ring-outline-variant transition-colors hover:bg-surface-high max-sm:min-h-[44px]';

    return (
        <div className="mb-6 space-y-3">
            <div className="space-y-4 px-6 pt-6 max-sm:px-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <span
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-4 ring-white dark:bg-gray-800 dark:ring-gray-900"
                        style={{
                            backgroundColor: `color-mix(in srgb, ${tint} 18%, transparent)`,
                            color: tint,
                        }}
                    >
                        <TagIcon className="h-7 w-7" />
                    </span>

                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                {isSystem
                                    ? t('tags.systemTag', 'System tag')
                                    : t('tags.tag', 'Tag')}
                            </span>
                            <span>
                                {tasksCount} {t('tags.stats.tasks', 'tasks')}
                            </span>
                            <span>·</span>
                            <span>
                                {notesCount} {t('tags.stats.notes', 'notes')}
                            </span>
                            {projectsCount > 0 && (
                                <>
                                    <span>·</span>
                                    <span>
                                        {projectsCount}{' '}
                                        {t('tags.stats.projects', 'projects')}
                                    </span>
                                </>
                            )}
                        </div>

                        <h1
                            className="line-clamp-2 text-headline font-extrabold leading-tight tracking-tight text-surface-on"
                            data-testid="tag-name"
                        >
                            {tag.name}
                        </h1>
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onSearchToggle}
                            className={actionClass}
                            title={t('common.search', 'Search tasks')}
                        >
                            <MagnifyingGlassIcon className="h-4 w-4" />
                            {t('common.search', 'Search')}
                        </button>
                        <button
                            type="button"
                            onClick={onTogglePin}
                            className={actionClass}
                            aria-pressed={!!tag.pinned}
                            title={
                                tag.pinned
                                    ? t(
                                          'tags.unpinFromSidebar',
                                          'Unpin from sidebar'
                                      )
                                    : t('tags.pinToSidebar', 'Pin to sidebar')
                            }
                        >
                            <PushPinIcon
                                className={`h-4 w-4 ${tag.pinned ? 'text-red-500 dark:text-red-400' : ''}`}
                                filled={!!tag.pinned}
                            />
                            {tag.pinned
                                ? t('project.pinned', 'Pinned')
                                : t('project.pin', 'Pin')}
                        </button>
                        <button
                            type="button"
                            ref={editButtonRef}
                            className={actionClass}
                            aria-label={t('tags.editTagAriaLabel', {
                                tagName: tag.name,
                            })}
                            title={t('tags.editTagTitle', {
                                tagName: tag.name,
                            })}
                        >
                            <PencilSquareIcon className="h-4 w-4" />
                            {isSystem
                                ? t('tags.customize', 'Customize')
                                : t('common.edit', 'Edit')}
                        </button>
                        {!isSystem && (
                            <button
                                type="button"
                                onClick={onDeleteClick}
                                className={actionClass}
                                aria-label={t('tags.deleteTagAriaLabel', {
                                    tagName: tag.name,
                                })}
                                title={t('tags.deleteTagTitle', {
                                    tagName: tag.name,
                                })}
                            >
                                <TrashIcon className="h-4 w-4" />
                                {t('common.delete', 'Delete')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TagHero;

import React from 'react';
import { useTagColor } from '../../utils/tagColor';
import { TFunction } from 'i18next';
import {
    EllipsisHorizontalIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { Tag } from '../../entities/Tag';
import PushPinIcon from '../Shared/Icons/PushPinIcon';
import PageHeader from '../Shared/ui/PageHeader';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import EntityMark from '../Shared/ui/EntityMark';
import { countsLine } from '../Shared/ui/ListRow';

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

// The shared page header, as on a project: the tag icon in its colour, the
// name, what uses it, one action (Edit) and the rest under ⋯.
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

    const uses = countsLine(t, {
        tasks: tasksCount,
        notes: notesCount,
        projects: projectsCount,
    });
    const meta = [isSystem ? t('tags.systemTag', 'System tag') : null, uses]
        .filter(Boolean)
        .join(' · ');

    const menu: MenuEntry[] = [
        {
            key: 'search',
            label: t('common.search', 'Search'),
            icon: <MagnifyingGlassIcon />,
            onSelect: onSearchToggle,
            testId: 'tag-search-toggle',
        },
        {
            key: 'pin',
            label: tag.pinned
                ? t('tags.unpinFromSidebar', 'Unpin from sidebar')
                : t('tags.pinToSidebar', 'Pin to sidebar'),
            icon: <PushPinIcon filled={!!tag.pinned} />,
            onSelect: onTogglePin,
            testId: 'tag-pin-toggle',
        },
        ...(isSystem
            ? []
            : [
                  'separator' as const,
                  {
                      key: 'delete',
                      label: t('common.delete', 'Delete'),
                      icon: <TrashIcon />,
                      danger: true,
                      onSelect: onDeleteClick,
                      testId: 'tag-delete',
                  },
              ]),
    ];

    return (
        <PageHeader
            className="mb-2"
            leading={
                <EntityMark
                    kind="tag"
                    icon={tag.icon}
                    color={tint}
                    className="h-6 w-6"
                />
            }
            title={<span data-testid="tag-name">{tag.name}</span>}
            meta={meta || undefined}
            actions={
                <>
                    <Button
                        ref={editButtonRef}
                        variant="secondary"
                        size="sm"
                        icon={<PencilSquareIcon className="h-4 w-4" />}
                        aria-label={t('tags.editTagAriaLabel', {
                            tagName: tag.name,
                        })}
                        title={t('tags.editTagTitle', { tagName: tag.name })}
                    >
                        {isSystem
                            ? t('tags.customize', 'Customize')
                            : t('common.edit', 'Edit')}
                    </Button>
                    <Menu
                        entries={menu}
                        testId="tag-actions-menu"
                        trigger={(triggerProps) => (
                            <IconButton
                                {...triggerProps}
                                label={t('project.moreOptions', 'More options')}
                            >
                                <EllipsisHorizontalIcon />
                            </IconButton>
                        )}
                    />
                </>
            }
        />
    );
};

export default TagHero;

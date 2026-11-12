import React from 'react';
import { useTranslation } from 'react-i18next';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Tag } from '../../entities/Tag';
import PushPinIcon from '../Shared/Icons/PushPinIcon';
import EntityIcon from '../Shared/EntityIcon';
import ListRow, { ColorDot } from '../Shared/ui/ListRow';
import { MenuEntry } from '../Shared/ui/Menu';
import { useTagColor } from '../../utils/tagColor';

interface TagRowProps {
    tag: Tag;
    // Shown instead of the full name, e.g. the leaf of a nested tag.
    label?: string;
    onEdit: (tag: Tag) => void;
    onDelete: (tag: Tag) => void;
}

export const tagPath = (tag: Tag): string =>
    tag.uid
        ? `/tag/${tag.uid}-${tag.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')}`
        : `/tag/${encodeURIComponent(tag.name)}`;

/** Tasks, notes and projects that carry the tag. */
export const tagUseCount = (tag: Tag): number =>
    (tag.tasks_count ?? 0) + (tag.notes_count ?? 0) + (tag.projects_count ?? 0);

// One tag in the list: its colour as the leading mark (the only colour on
// the row), the name, then what uses it, with zero counts left out.
const TagRow: React.FC<TagRowProps> = ({ tag, label, onEdit, onDelete }) => {
    const { t } = useTranslation();
    const tagColor = useTagColor();
    const isSystem = tag.tag_type === 'system';
    const color = tagColor(tag).value;

    const uses = [
        [tag.tasks_count, t('tags.stats.tasks', 'tasks')],
        [tag.notes_count, t('tags.stats.notes', 'notes')],
        [tag.projects_count, t('tags.stats.projects', 'projects')],
    ]
        .filter(([count]) => Number(count) > 0)
        .map(([count, word]) => `${count} ${word}`)
        .join(' · ');

    const id = tag.uid || tag.id;
    const menu: MenuEntry[] = [
        {
            key: 'edit',
            label: isSystem
                ? t('tags.customize', 'Customize')
                : t('tags.edit', 'Edit'),
            onSelect: () => onEdit(tag),
            testId: `tag-edit-${id}`,
        },
        ...(isSystem
            ? []
            : [
                  {
                      key: 'delete',
                      label: t('tags.delete', 'Delete'),
                      danger: true,
                      onSelect: () => onDelete(tag),
                      testId: `tag-delete-${id}`,
                  },
              ]),
    ];

    return (
        <ListRow
            to={tagPath(tag)}
            testId={`tag-row-${id}`}
            leading={
                tag.icon ? (
                    <span style={{ color }} className="flex">
                        <EntityIcon icon={tag.icon} className="h-4 w-4" />
                    </span>
                ) : (
                    <ColorDot color={color} />
                )
            }
            title={
                <span className="inline-flex max-w-full items-center gap-1.5">
                    <span className="truncate" title={tag.name}>
                        {label ?? tag.name}
                    </span>
                    {tag.pinned && !isSystem && (
                        <PushPinIcon
                            filled
                            className="h-3.5 w-3.5 shrink-0 text-surface-on-variant"
                        />
                    )}
                    {isSystem && (
                        <LockClosedIcon
                            className="h-3.5 w-3.5 shrink-0 text-surface-on-variant"
                            title={t('tags.systemTag', 'System tag')}
                        />
                    )}
                </span>
            }
            meta={uses || undefined}
            menu={menu}
            menuTestId={`tag-dropdown-${id}`}
            menuLabel={t('tags.toggleDropdownMenu', 'Toggle dropdown menu')}
        />
    );
};

export default TagRow;

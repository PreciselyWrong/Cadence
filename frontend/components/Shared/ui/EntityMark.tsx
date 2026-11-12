import React from 'react';
import {
    FlagIcon,
    FolderIcon,
    Squares2X2Icon,
    TagIcon,
    UserGroupIcon,
} from '@heroicons/react/24/outline';
import EntityIcon from '../EntityIcon';

export type EntityKind = 'area' | 'project' | 'tag' | 'person' | 'goal';

/**
 * One icon per kind of item, the one its sidebar section shows: lists,
 * page headers and the sidebar all draw an area, a project, a tag... the
 * same way.
 */
export const ENTITY_KIND_ICONS: Record<
    EntityKind,
    React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
    area: Squares2X2Icon,
    project: FolderIcon,
    tag: TagIcon,
    person: UserGroupIcon,
    goal: FlagIcon,
};

interface EntityMarkProps {
    kind: EntityKind;
    /** The item's own icon (shared icon set), drawn instead when set. */
    icon?: string | null;
    /** The item's colour, as the icon's tint; grey without one. */
    color?: string | null;
    className?: string;
}

/** The leading mark of a row or a page header. */
const EntityMark: React.FC<EntityMarkProps> = ({
    kind,
    icon,
    color,
    className = 'h-4 w-4',
}) => {
    const KindIcon = ENTITY_KIND_ICONS[kind];
    return (
        <span
            data-entity-kind={kind}
            aria-hidden="true"
            className={`flex shrink-0 ${color ? '' : 'text-surface-on-variant'}`}
            style={color ? { color } : undefined}
        >
            <EntityIcon
                icon={icon}
                className={className}
                fallback={<KindIcon className={`shrink-0 ${className}`} />}
            />
        </span>
    );
};

export default EntityMark;

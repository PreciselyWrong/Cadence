import React from 'react';
import { ENTITY_ICONS, EntityIconDef } from '../../constants/entityIcons';

const ICONS_BY_ID = new Map(ENTITY_ICONS.map((icon) => [icon.id, icon]));

export const findEntityIcon = (
    id: string | null | undefined
): EntityIconDef | undefined => (id ? ICONS_BY_ID.get(id) : undefined);

interface EntityIconProps {
    // An id from the shared icon set (projects, tags); unknown ids fall back.
    icon?: string | null;
    className?: string;
    fallback?: React.ReactNode;
}

const EntityIcon: React.FC<EntityIconProps> = ({
    icon,
    className = 'h-4 w-4',
    fallback = null,
}) => {
    const def = findEntityIcon(icon);
    if (!def) return <>{fallback}</>;
    return (
        <svg
            viewBox="0 -960 960 960"
            fill="currentColor"
            aria-hidden="true"
            className={`shrink-0 ${className}`}
        >
            <path d={def.path} />
        </svg>
    );
};

export default EntityIcon;

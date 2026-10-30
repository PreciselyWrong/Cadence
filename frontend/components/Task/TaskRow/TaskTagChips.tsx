import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    ACCENT,
    accentVars,
    resolveColor,
} from '../../../constants/colorPalette';

interface TagLike {
    uid?: string;
    name: string;
    color?: string | null;
}

interface TaskTagChipsProps {
    tags: TagLike[];
    max?: number;
    className?: string;
}

// Tags as small rounded chips: the tag's palette color when it has one,
// neutral gray otherwise. Past `max`, a "+N" chip lists the rest in its tooltip.
const TaskTagChips: React.FC<TaskTagChipsProps> = ({
    tags,
    max = 2,
    className = '',
}) => {
    const { t } = useTranslation();
    if (!tags || tags.length === 0) return null;
    const shown = tags.slice(0, max);
    const rest = tags.slice(max);
    const base =
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap';
    const neutral =
        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

    return (
        <span
            className={`flex items-center gap-1 min-w-0 ${className}`}
            data-testid="task-tag-chips"
        >
            {shown.map((tag) => {
                const color = resolveColor(tag.color);
                return (
                    <span
                        key={tag.uid || tag.name}
                        title={tag.name}
                        style={accentVars(color)}
                        className={`${base} max-w-[7rem] truncate ${
                            color ? `${ACCENT.softBg} ${ACCENT.text}` : neutral
                        }`}
                    >
                        {tag.name}
                    </span>
                );
            })}
            {rest.length > 0 && (
                <span
                    title={rest.map((tag) => tag.name).join(', ')}
                    className={`${base} ${neutral}`}
                >
                    {t('tasks.moreTags', '+{{count}}', { count: rest.length })}
                </span>
            )}
        </span>
    );
};

export default TaskTagChips;

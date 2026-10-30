import React from 'react';

export interface SegmentItem {
    id: string;
    label: string;
}

interface SegmentedTabsProps {
    segments: SegmentItem[];
    selected: string;
    onSelect: (id: string) => void;
    className?: string;
    'aria-label'?: string;
}

// Android SegmentedTabs: a full-width glass pill, the active segment in the
// primary container.
const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
    segments,
    selected,
    onSelect,
    className = '',
    'aria-label': ariaLabel,
}) => (
    <div
        role="tablist"
        aria-label={ariaLabel}
        className={`flex rounded-full border border-outline/35 bg-surface-variant/60 p-1 dark:bg-surface-variant/35 ${className}`}
    >
        {segments.map((segment) => {
            const active = segment.id === selected;
            return (
                <button
                    key={segment.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onSelect(segment.id)}
                    className={`h-10 min-w-0 flex-1 truncate rounded-full px-3 text-label transition-colors duration-[220ms] ${
                        active
                            ? 'bg-primary-container text-primary-on-container'
                            : 'text-surface-on-variant'
                    }`}
                >
                    {segment.label}
                </button>
            );
        })}
    </div>
);

export default SegmentedTabs;

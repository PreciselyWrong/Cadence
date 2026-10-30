import React from 'react';

export interface TabPillItem {
    id: string;
    label: string;
    count?: number;
}

interface TabPillsProps {
    tabs: TabPillItem[];
    selected: string;
    onSelect: (id: string) => void;
    className?: string;
    'aria-label'?: string;
}

// Android TabPills: horizontally scrolling pills, the active one filled with
// the primary colour, the others translucent glass with their count.
const TabPills: React.FC<TabPillsProps> = ({
    tabs,
    selected,
    onSelect,
    className = '',
    'aria-label': ariaLabel,
}) => (
    <div
        role="tablist"
        aria-label={ariaLabel}
        className={`flex gap-2 overflow-x-auto scrollbar-hide ${className}`}
    >
        {tabs.map((tab) => {
            const active = tab.id === selected;
            return (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onSelect(tab.id)}
                    className={`flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-label whitespace-nowrap transition-colors duration-[220ms] active:scale-[0.97] ${
                        active
                            ? 'bg-primary text-primary-on'
                            : 'border border-outline/35 bg-surface-variant/60 text-surface-on dark:bg-surface-variant/35'
                    }`}
                >
                    {tab.label}
                    {tab.count !== undefined && (
                        <span
                            className={`text-label-m ${
                                active
                                    ? 'text-primary-on/75'
                                    : 'text-surface-on-variant'
                            }`}
                        >
                            {tab.count}
                        </span>
                    )}
                </button>
            );
        })}
    </div>
);

export default TabPills;

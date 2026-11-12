import React from 'react';

export interface SegmentedOption {
    id: string;
    label: string;
    /** Shown after the label when it is not zero. */
    count?: number;
    testId?: string;
}

interface SegmentedProps {
    options: SegmentedOption[];
    selected: string;
    onSelect: (id: string) => void;
    'aria-label'?: string;
    className?: string;
}

/**
 * The view or filter switch of desktop pages, as on Plan (Days | Horizons):
 * a quiet track, the chosen segment raised on the surface.
 */
const Segmented: React.FC<SegmentedProps> = ({
    options,
    selected,
    onSelect,
    'aria-label': ariaLabel,
    className = '',
}) => (
    <div
        role="tablist"
        aria-label={ariaLabel}
        className={`inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-high p-0.5 scrollbar-hide ${className}`}
    >
        {options.map((option) => {
            const active = option.id === selected;
            return (
                <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={option.testId}
                    onClick={() => onSelect(option.id)}
                    className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 text-body-m font-medium transition-colors duration-150 max-sm:h-10 ${
                        active
                            ? 'bg-surface text-surface-on shadow-sm'
                            : 'text-surface-on-variant hover:text-surface-on'
                    }`}
                >
                    {option.label}
                    {!!option.count && (
                        <span className="tabular-nums text-surface-on-variant">
                            {option.count}
                        </span>
                    )}
                </button>
            );
        })}
    </div>
);

export default Segmented;

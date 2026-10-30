import React from 'react';
import { useTranslation } from 'react-i18next';

interface SkeletonRowsProps {
    rows?: number;
    /** Round avatar-like leading block instead of the task check square. */
    variant?: 'task' | 'card';
    className?: string;
}

// Widths vary a little so the placeholder reads as a list, not a grid.
const TITLE_WIDTHS = ['w-3/5', 'w-2/5', 'w-4/5', 'w-1/2', 'w-2/3', 'w-1/3'];

// Placeholder rows shown while a list loads, in place of a spinner. The
// shimmer stops under prefers-reduced-motion.
const SkeletonRows: React.FC<SkeletonRowsProps> = ({
    rows = 6,
    variant = 'task',
    className = '',
}) => {
    const { t } = useTranslation();
    return (
        <div
            role="status"
            aria-busy="true"
            aria-label={t('common.loading', 'Loading...')}
            className={`flex flex-col ${
                variant === 'card'
                    ? 'gap-3'
                    : 'divide-y divide-gray-100 dark:divide-white/5'
            } ${className}`}
            data-testid="skeleton-rows"
        >
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={i}
                    className={`flex items-center gap-3 px-4 motion-safe:animate-pulse ${
                        variant === 'card'
                            ? 'h-16 rounded-card bg-gray-100 dark:bg-gray-800'
                            : 'py-3.5'
                    }`}
                >
                    <span
                        className={`h-[22px] w-[22px] shrink-0 bg-gray-200 dark:bg-gray-700 ${
                            variant === 'card'
                                ? 'rounded-chip'
                                : 'rounded-checkbox'
                        }`}
                    />
                    <span
                        className={`h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 ${
                            TITLE_WIDTHS[i % TITLE_WIDTHS.length]
                        }`}
                    />
                </div>
            ))}
        </div>
    );
};

export default SkeletonRows;

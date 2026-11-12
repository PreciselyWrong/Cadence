import React from 'react';

export interface EmptyStateProps {
    /** One short sentence: what is empty. */
    title: React.ReactNode;
    /** What to do about it, on a lighter line. */
    hint?: React.ReactNode;
    /** At most one button (an md Button). */
    action?: React.ReactNode;
    className?: string;
    'data-testid'?: string;
}

/**
 * The empty state of every page and list: a title, an optional hint, an
 * optional action. No icon, no illustration: the page title already says
 * where you are.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    hint,
    action,
    className = '',
    'data-testid': testId,
}) => (
    <div
        role="status"
        data-testid={testId}
        className={`flex flex-col items-center px-6 py-12 text-center max-sm:px-4 ${className}`}
    >
        <p className="text-body font-semibold text-surface-on">{title}</p>
        {hint && (
            <p className="mt-1 max-w-sm text-body-m text-surface-on-variant">
                {hint}
            </p>
        )}
        {action && <div className="mt-4">{action}</div>}
    </div>
);

export default EmptyState;

import React from 'react';

export interface PageHeaderProps {
    title: React.ReactNode;
    /** Lighter text after the title, on the same line (a date, a count). */
    subtitle?: React.ReactNode;
    /** Drawn before the title (an entity icon). */
    leading?: React.ReactNode;
    /** The one row of actions, right-aligned; it wraps under the title. */
    actions?: React.ReactNode;
    /** One quiet line under the title (a summary, a status). */
    meta?: React.ReactNode;
    /** Below the title row: filters, tabs, a search field. */
    children?: React.ReactNode;
    className?: string;
}

/**
 * The page header of every desktop page, as on Today: an 800-weight title,
 * one action row on the right, an optional summary line. Nothing overlaps:
 * the actions wrap under the title when space runs out.
 */
const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    leading,
    actions,
    meta,
    children,
    className = '',
}) => (
    <header className={`px-6 pb-3 pt-6 max-sm:px-4 ${className}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
            {leading && (
                <span className="flex shrink-0 items-center">{leading}</span>
            )}
            <h1 className="mr-1 flex min-w-0 max-w-full items-baseline gap-2">
                <span className="min-w-0 truncate text-headline font-extrabold tracking-tight text-surface-on">
                    {title}
                </span>
                {subtitle && (
                    <span className="min-w-0 truncate text-title font-medium text-surface-on-variant">
                        {subtitle}
                    </span>
                )}
            </h1>
            {actions && (
                <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1">
                    {actions}
                </div>
            )}
        </div>
        {meta && (
            <div className="mt-1 min-w-0 text-body-m tabular-nums text-surface-on-variant">
                {meta}
            </div>
        )}
        {children && <div className="mt-3">{children}</div>}
    </header>
);

export default PageHeader;

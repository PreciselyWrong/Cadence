import React from 'react';

/**
 * The two page templates of the desktop app:
 * - `board`: the full content width (Today, Plan, Calendar, Habits, and the
 *   page of one area, project, tag, person, goal or view);
 * - `list`: one centred column (Inbox, Projects, Areas, Tags, People,
 *   Links, Review, À trier).
 * Both start their title and content at the same gutter, PAGE_GUTTER, which
 * is also the breadcrumb's; PageHeader applies it itself.
 */
export type PageTemplate = 'board' | 'list';

/** Left and right padding of every header, section and breadcrumb. */
export const PAGE_GUTTER = 'px-6 max-sm:px-4';

const TEMPLATES: Record<PageTemplate, string> = {
    board: 'w-full',
    list: 'mx-auto w-full max-w-4xl',
};

export interface PageShellProps {
    template: PageTemplate;
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
}

const PageShell: React.FC<PageShellProps> = ({
    template,
    children,
    className = '',
    'data-testid': testId,
}) => (
    <div
        data-page-template={template}
        data-testid={testId}
        className={`min-w-0 pb-12 ${TEMPLATES[template]} ${className}`}
    >
        {children}
    </div>
);

export default PageShell;

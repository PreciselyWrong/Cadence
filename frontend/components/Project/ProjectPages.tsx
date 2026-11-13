import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import Menu from '../Shared/ui/Menu';
import { Link } from '../../entities/Link';
import { addressLabel } from '../../utils/linkTriage';
import { LinkThumb, SiteIcon } from '../Links/LinkMarks';

export type PageCheck = 'ok' | 'dead' | 'unknown';

interface ProjectPagesProps {
    pages: Link[];
    // What « Vérifier les pages » found, by page uid.
    checks: Record<string, PageCheck>;
    onCreateTask: (page: Link) => void;
    onEdit: (
        page: Link,
        changes: { title: string; note: string }
    ) => Promise<void>;
    onRemove: (page: Link) => void;
}

const PageRow: React.FC<{
    page: Link;
    check?: PageCheck;
    onCreateTask: () => void;
    onEdit: (changes: { title: string; note: string }) => Promise<void>;
    onRemove: () => void;
}> = ({ page, check, onCreateTask, onEdit, onRemove }) => {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(page.title ?? '');
    const [note, setNote] = useState(page.note ?? '');
    const name = page.title || addressLabel(page.url);

    if (editing) {
        return (
            <li className="space-y-2 px-3 py-2">
                <input
                    aria-label={t('projectPages.title', 'Title')}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <input
                    aria-label={t('projectPages.note', 'Note')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <div className="flex justify-end gap-3 text-[12px]">
                    <button type="button" onClick={() => setEditing(false)}>
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="button"
                        className="font-medium text-blue-600 dark:text-blue-400"
                        onClick={async () => {
                            await onEdit({ title, note });
                            setEditing(false);
                        }}
                    >
                        {t('common.save', 'Save')}
                    </button>
                </div>
            </li>
        );
    }

    return (
        <li className="group flex items-center gap-3 px-3 py-2">
            {/* The site's icon; its initial while there is none. */}
            <span
                aria-hidden
                className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-[12px] font-semibold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
                {(page.domain || '?').charAt(0)}
                <SiteIcon
                    url={page.url}
                    className="absolute inset-1 h-5 w-5 bg-gray-100 dark:bg-gray-800"
                />
            </span>
            <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
            >
                <span className="block truncate text-[14px] text-gray-900 dark:text-gray-100">
                    {name}
                </span>
                <span className="block truncate text-[12px] text-gray-500 dark:text-gray-400">
                    {page.title ? page.domain : null}
                    {page.note && page.title ? ' · ' : null}
                    {page.note && (
                        <span className="text-gray-600 dark:text-gray-300">
                            {page.note}
                        </span>
                    )}
                </span>
            </a>
            <LinkThumb image={page.image_url} />
            {check === 'dead' && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {t('projectPages.dead', 'Not found')}
                </span>
            )}
            <Menu
                entries={[
                    {
                        key: 'task',
                        label: t('projectPages.createTask', 'Create a task'),
                        onSelect: onCreateTask,
                    },
                    {
                        key: 'edit',
                        label: t('common.edit', 'Edit'),
                        onSelect: () => setEditing(true),
                    },
                    {
                        key: 'remove',
                        label: t('projectPages.remove', 'Remove'),
                        danger: true,
                        onSelect: onRemove,
                    },
                ]}
                trigger={(props) => (
                    <button
                        type="button"
                        {...props}
                        aria-label={t('projectPages.actions', 'Page actions')}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                    >
                        <EllipsisHorizontalIcon className="h-4 w-4" />
                    </button>
                )}
            />
        </li>
    );
};

// The material of a project: compact rows under its tasks
// (docs/37-links.md, Project pages).
const ProjectPages: React.FC<ProjectPagesProps> = ({
    pages,
    checks,
    onCreateTask,
    onEdit,
    onRemove,
}) => {
    const { t } = useTranslation();
    if (pages.length === 0) return null;
    return (
        <section data-testid="project-pages">
            <h3 className="mb-1 px-1 text-[13px] font-semibold text-gray-700 dark:text-gray-200">
                {t('projectPages.heading', 'Pages')}
            </h3>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200/80 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                {pages.map((page) => (
                    <PageRow
                        key={page.uid}
                        page={page}
                        check={checks[page.uid]}
                        onCreateTask={() => onCreateTask(page)}
                        onEdit={(changes) => onEdit(page, changes)}
                        onRemove={() => onRemove(page)}
                    />
                ))}
            </ul>
        </section>
    );
};

export default ProjectPages;

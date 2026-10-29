import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { getApiPath } from '../../config/paths';
import { getCsrfToken } from '../../utils/csrfService';

export type NewViewDue = '' | 'today' | 'next_7_days' | 'overdue' | 'no_date';
export type NewViewPriority = '' | 'low' | 'medium' | 'high';
export type NewViewStatus = 'open' | 'done';

export interface NewViewForm {
    name: string;
    projectUid: string;
    tag: string;
    priority: NewViewPriority;
    due: NewViewDue;
    status: NewViewStatus;
}

export const EMPTY_NEW_VIEW: NewViewForm = {
    name: '',
    projectUid: '',
    tag: '',
    priority: '',
    due: '',
    status: 'open',
};

// The saved view body the backend accepts: due "today" or "next_week" (the
// next 7 days), extras "overdue" and "no_due_date", task_status "done" for
// done tasks, and project_uid to narrow to one project.
export const buildViewPayload = (form: NewViewForm) => {
    const extras: string[] = [];
    if (form.due === 'overdue') extras.push('overdue');
    if (form.due === 'no_date') extras.push('no_due_date');
    const due =
        form.due === 'today'
            ? 'today'
            : form.due === 'next_7_days'
              ? 'next_week'
              : null;
    return {
        name: form.name.trim(),
        search_query: null,
        filters: ['Task'],
        priority: form.priority || null,
        due,
        defer: null,
        tags: form.tag ? [form.tag] : [],
        extras,
        task_status: form.status === 'done' ? 'done' : null,
        project_uid: form.projectUid || null,
    };
};

interface NewViewDialogProps {
    onClose: () => void;
    onCreated: (view: { uid: string; name: string }) => void;
}

const NewViewDialog: React.FC<NewViewDialogProps> = ({
    onClose,
    onCreated,
}) => {
    const { t } = useTranslation();
    const [form, setForm] = useState<NewViewForm>(EMPTY_NEW_VIEW);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const projects = useStore((state) => state.projectsStore.projects);
    const hasLoadedProjects = useStore(
        (state) => state.projectsStore.hasLoaded
    );
    const loadProjects = useStore((state) => state.projectsStore.loadProjects);
    const tags = useStore((state) => state.tagsStore.tags);
    const hasLoadedTags = useStore((state) => state.tagsStore.hasLoaded);
    const loadTags = useStore((state) => state.tagsStore.loadTags);

    useEffect(() => {
        if (!hasLoadedProjects) loadProjects();
        if (!hasLoadedTags) loadTags();
        // Runs once, when the dialog opens.
    }, []);

    const update = <K extends keyof NewViewForm>(
        key: K,
        value: NewViewForm[K]
    ) => setForm((current) => ({ ...current, [key]: value }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError(t('search.viewNameRequired', 'View name is required'));
            return;
        }
        setSaving(true);
        setError('');
        try {
            const response = await fetch(getApiPath('views'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': await getCsrfToken(),
                },
                credentials: 'include',
                body: JSON.stringify(buildViewPayload(form)),
            });
            if (!response.ok) throw new Error('Failed to create view');
            const created = await response.json();
            window.dispatchEvent(new Event('viewUpdated'));
            onCreated(created);
        } catch {
            setError(t('newView.createError', 'Could not create the view'));
        } finally {
            setSaving(false);
        }
    };

    const selectClass =
        'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
    const labelClass =
        'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 px-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-view-title"
                data-testid="new-view-dialog"
                className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
                onClick={(e) => e.stopPropagation()}
            >
                <h2
                    id="new-view-title"
                    className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100"
                >
                    {t('newView.title', 'New view')}
                </h2>
                <form onSubmit={submit} className="space-y-3">
                    <div>
                        <label htmlFor="new-view-name" className={labelClass}>
                            {t('newView.name', 'Name')}
                        </label>
                        <input
                            id="new-view-name"
                            type="text"
                            value={form.name}
                            onChange={(e) => update('name', e.target.value)}
                            className={selectClass}
                            autoFocus
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="new-view-project"
                                className={labelClass}
                            >
                                {t('newView.project', 'Project')}
                            </label>
                            <select
                                id="new-view-project"
                                value={form.projectUid}
                                onChange={(e) =>
                                    update('projectUid', e.target.value)
                                }
                                className={selectClass}
                            >
                                <option value="">
                                    {t('newView.any', 'Any')}
                                </option>
                                {projects.map((project) => (
                                    <option
                                        key={project.uid}
                                        value={project.uid}
                                    >
                                        {project.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor="new-view-tag"
                                className={labelClass}
                            >
                                {t('newView.tag', 'Tag')}
                            </label>
                            <select
                                id="new-view-tag"
                                value={form.tag}
                                onChange={(e) => update('tag', e.target.value)}
                                className={selectClass}
                            >
                                <option value="">
                                    {t('newView.any', 'Any')}
                                </option>
                                {tags.map((tag) => (
                                    <option key={tag.name} value={tag.name}>
                                        {tag.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor="new-view-priority"
                                className={labelClass}
                            >
                                {t('newView.priority', 'Priority')}
                            </label>
                            <select
                                id="new-view-priority"
                                value={form.priority}
                                onChange={(e) =>
                                    update(
                                        'priority',
                                        e.target.value as NewViewPriority
                                    )
                                }
                                className={selectClass}
                            >
                                <option value="">
                                    {t('newView.any', 'Any')}
                                </option>
                                <option value="high">
                                    {t('priority.high', 'High')}
                                </option>
                                <option value="medium">
                                    {t('priority.medium', 'Medium')}
                                </option>
                                <option value="low">
                                    {t('priority.low', 'Low')}
                                </option>
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor="new-view-due"
                                className={labelClass}
                            >
                                {t('newView.due', 'Due')}
                            </label>
                            <select
                                id="new-view-due"
                                value={form.due}
                                onChange={(e) =>
                                    update('due', e.target.value as NewViewDue)
                                }
                                className={selectClass}
                            >
                                <option value="">
                                    {t('newView.any', 'Any')}
                                </option>
                                <option value="today">
                                    {t('newView.dueToday', 'Today')}
                                </option>
                                <option value="next_7_days">
                                    {t('newView.dueNext7Days', 'Next 7 days')}
                                </option>
                                <option value="overdue">
                                    {t('newView.dueOverdue', 'Overdue')}
                                </option>
                                <option value="no_date">
                                    {t('newView.dueNoDate', 'No due date')}
                                </option>
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor="new-view-status"
                                className={labelClass}
                            >
                                {t('newView.status', 'Status')}
                            </label>
                            <select
                                id="new-view-status"
                                value={form.status}
                                onChange={(e) =>
                                    update(
                                        'status',
                                        e.target.value as NewViewStatus
                                    )
                                }
                                className={selectClass}
                            >
                                <option value="open">
                                    {t('newView.statusOpen', 'Open')}
                                </option>
                                <option value="done">
                                    {t('newView.statusDone', 'Done')}
                                </option>
                            </select>
                        </div>
                    </div>
                    {error && (
                        <p role="alert" className="text-sm text-red-600">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                            {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                        >
                            {t('newView.create', 'Create view')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewViewDialog;

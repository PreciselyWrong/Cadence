import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../entities/Link';
import { Task } from '../../entities/Task';
import {
    checkProjectPages,
    deleteLink,
    fetchProjectPages,
    updateLink,
} from '../../utils/linksService';
import { createTask } from '../../utils/tasksService';
import { capturedTask, VERB_FALLBACKS } from '../../utils/linkTaskName';
import { pagesMarkdown } from '../../utils/projectPages';
import { useToast } from '../Shared/ToastContext';
import { PageCheck } from './ProjectPages';

// The pages of a project and what can be done with them; `onTaskCreated`
// lets the page reload its tasks.
export function useProjectPages(
    projectUid: string | undefined,
    onTaskCreated?: () => void
) {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const [pages, setPages] = useState<Link[]>([]);
    const [checks, setChecks] = useState<Record<string, PageCheck>>({});

    const reload = useCallback(() => {
        if (!projectUid) return;
        fetchProjectPages(projectUid)
            .then(setPages)
            .catch(() => setPages([]));
    }, [projectUid]);

    useEffect(() => {
        setChecks({});
        reload();
    }, [reload]);

    const createTaskFrom = async (page: Link) => {
        const { name, note } = capturedTask(
            { url: page.url, title: page.title, kind: page.kind },
            (key, title) => t(key, VERB_FALLBACKS[key], { title })
        );
        try {
            await createTask({
                name,
                note,
                project_uid: projectUid,
                status: 'not_started',
                source: 'link',
                source_url: page.url,
            } as Task);
            showSuccessToast(t('links.capture.taskAdded', 'Task added'));
            onTaskCreated?.();
        } catch {
            showErrorToast(t('task.createError', 'Could not create the task.'));
        }
    };

    const edit = async (
        page: Link,
        changes: { title: string; note: string }
    ) => {
        const saved = await updateLink(page.uid, {
            title: changes.title.trim() || null,
            note: changes.note.trim() || null,
        });
        setPages((list) => list.map((p) => (p.uid === saved.uid ? saved : p)));
    };

    const remove = async (page: Link) => {
        setPages((list) => list.filter((p) => p.uid !== page.uid));
        try {
            await deleteLink(page.uid);
        } catch {
            showErrorToast(
                t('projectPages.removeError', 'Could not remove the page.')
            );
            reload();
        }
    };

    const copyMarkdown = async () => {
        await navigator.clipboard.writeText(pagesMarkdown(pages));
        showSuccessToast(t('projectPages.copied', 'Pages copied as Markdown'));
    };

    const check = async () => {
        if (!projectUid) return;
        try {
            const results = await checkProjectPages(projectUid);
            setChecks(Object.fromEntries(results.map((r) => [r.uid, r.state])));
            const dead = results.filter((r) => r.state === 'dead').length;
            showSuccessToast(
                dead
                    ? t('projectPages.deadCount', '{{count}} pages not found', {
                          count: dead,
                      })
                    : t('projectPages.allAnswer', 'Every page answers')
            );
        } catch {
            showErrorToast(
                t('projectPages.checkError', 'Could not check the pages.')
            );
        }
    };

    return {
        pages,
        checks,
        reload,
        createTaskFrom,
        edit,
        remove,
        copyMarkdown,
        check,
    };
}

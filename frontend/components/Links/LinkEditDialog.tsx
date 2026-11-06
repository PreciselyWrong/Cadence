import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../entities/Link';
import { Project } from '../../entities/Project';
import { Tag } from '../../entities/Tag';
import { LinkChanges } from '../../utils/linksService';
import TagInput from '../Tag/TagInput';

interface LinkEditDialogProps {
    link: Link;
    projects: Project[];
    availableTags: Tag[];
    onSave: (changes: LinkChanges) => Promise<unknown>;
    onClose: () => void;
}

const FIELD =
    'w-full min-h-[40px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const LABEL = 'block text-[13px] font-medium text-gray-700 dark:text-gray-300';

// Everything of a link that is the user's. Only what changed is sent: an
// address kept as it is does not read the page again.
const LinkEditDialog: React.FC<LinkEditDialogProps> = ({
    link,
    projects,
    availableTags,
    onSave,
    onClose,
}) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState(link.title ?? '');
    const [url, setUrl] = useState(link.url);
    const [note, setNote] = useState(link.note ?? '');
    const [projectUid, setProjectUid] = useState(link.project_uid ?? '');
    const [tags, setTags] = useState(link.tags.map((tag) => tag.name));
    const [busy, setBusy] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const changes: LinkChanges = {};
        if (title.trim() !== (link.title ?? '')) changes.title = title;
        if (url.trim() !== link.url) changes.url = url.trim();
        if (note.trim() !== (link.note ?? '')) changes.note = note;
        if (projectUid !== (link.project_uid ?? '')) {
            changes.project_uid = projectUid || null;
        }
        const before = link.tags.map((tag) => tag.name);
        if (tags.join('\n') !== before.join('\n')) changes.tags = tags;
        if (Object.keys(changes).length === 0) {
            onClose();
            return;
        }
        setBusy(true);
        try {
            await onSave(changes);
            onClose();
        } catch {
            // The page reports it; what was typed stays to correct it.
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-label={t('links.editTitle', 'Edit the link')}
                onSubmit={(event) => void submit(event)}
                onClick={(event) => event.stopPropagation()}
                className="max-h-full w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
            >
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    {t('links.editTitle', 'Edit the link')}
                </h2>
                <label className={LABEL}>
                    {t('links.field.title', 'Title')}
                    <input
                        className={`${FIELD} mt-1 font-normal`}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </label>
                <label className={LABEL}>
                    {t('links.field.url', 'Address')}
                    <input
                        type="url"
                        required
                        className={`${FIELD} mt-1 font-normal`}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                    />
                </label>
                <label className={LABEL}>
                    {t('links.tryProject', 'Project')}
                    <select
                        className={`${FIELD} mt-1 font-normal`}
                        value={projectUid}
                        onChange={(e) => setProjectUid(e.target.value)}
                    >
                        <option value="">
                            {t('links.tryNoProject', 'No project')}
                        </option>
                        {projects.map((project) => (
                            <option key={project.uid} value={project.uid}>
                                {project.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={LABEL}>
                    {t('links.note', 'Your note')}
                    <textarea
                        rows={3}
                        className={`${FIELD} mt-1 py-2 font-normal`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                </label>
                <div className={LABEL}>
                    {t('links.field.tags', 'Tags')}
                    <div className="mt-1 font-normal">
                        <TagInput
                            initialTags={tags}
                            onTagsChange={setTags}
                            availableTags={availableTags}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[40px] rounded-lg px-4 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={busy}
                        className="min-h-[40px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {t('common.save', 'Save')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default LinkEditDialog;

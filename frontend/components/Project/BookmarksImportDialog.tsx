import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Project } from '../../entities/Project';
import {
    BookmarkFolder,
    bookmarkFolders,
    inBatches,
} from '../../utils/bookmarksImport';
import { addProjectPages } from '../../utils/projectPagesService';
import { createProject } from '../../utils/projectsService';

interface Props {
    projects: Project[];
    onClose: () => void;
    // The project that received the pages.
    onDone: (projectUid: string) => void;
}

// A folder of a Firefox bookmarks export (bookmarks.html) becomes the pages
// of a project: a new one named like the folder, or one chosen
// (docs/37-links.md, Project pages).
const BookmarksImportDialog: React.FC<Props> = ({
    projects,
    onClose,
    onDone,
}) => {
    const { t } = useTranslation();
    const [folders, setFolders] = useState<BookmarkFolder[] | null>(null);
    const [picked, setPicked] = useState<number | null>(null);
    const [target, setTarget] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const read = async (file: File | undefined) => {
        if (!file) return;
        const found = bookmarkFolders(await file.text());
        setFolders(found);
        setPicked(found.length === 1 ? 0 : null);
    };

    const run = async () => {
        if (picked === null || !folders) return;
        const folder = folders[picked];
        setBusy(true);
        setFailed(false);
        try {
            const projectUid =
                target ||
                ((await createProject({ name: folder.name, status: 'planned' }))
                    .uid as string);
            for (const batch of inBatches(folder.bookmarks)) {
                await addProjectPages(projectUid, batch);
            }
            onDone(projectUid);
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('bookmarksImport.title', 'Import bookmarks')}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-gray-900">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t('bookmarksImport.title', 'Import bookmarks')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t(
                        'bookmarksImport.hint',
                        'A Firefox export (Library › Import and Backup › Export). One folder becomes the pages of a project.'
                    )}
                </p>
                <input
                    type="file"
                    accept=".html,text/html"
                    aria-label={t('bookmarksImport.file', 'Bookmarks file')}
                    onChange={(e) => void read(e.target.files?.[0])}
                    className="text-sm"
                />
                {folders && folders.length === 0 && (
                    <p className="text-sm text-gray-500">
                        {t(
                            'bookmarksImport.empty',
                            'No bookmarks in this file.'
                        )}
                    </p>
                )}
                {folders && folders.length > 0 && (
                    <fieldset className="max-h-56 space-y-1 overflow-y-auto">
                        <legend className="mb-1 text-[12px] text-gray-500">
                            {t('bookmarksImport.folder', 'Folder')}
                        </legend>
                        {folders.map((folder, index) => (
                            <label
                                key={folder.name}
                                className="flex items-center gap-2 text-sm"
                            >
                                <input
                                    type="radio"
                                    name="bookmark-folder"
                                    checked={picked === index}
                                    onChange={() => setPicked(index)}
                                />
                                {`${folder.name} (${folder.bookmarks.length})`}
                            </label>
                        ))}
                    </fieldset>
                )}
                {picked !== null && folders && (
                    <select
                        aria-label={t('bookmarksImport.project', 'Project')}
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                        <option value="">
                            {t(
                                'bookmarksImport.newProject',
                                'New project « {{name}} »',
                                {
                                    name: folders[picked].name,
                                }
                            )}
                        </option>
                        {projects
                            .filter((project) => project.uid)
                            .map((project) => (
                                <option key={project.uid} value={project.uid}>
                                    {project.name}
                                </option>
                            ))}
                    </select>
                )}
                {failed && (
                    <p className="text-sm text-red-600">
                        {t(
                            'bookmarksImport.error',
                            'The import failed. Try again.'
                        )}
                    </p>
                )}
                <div className="flex justify-end gap-3 text-sm">
                    <button type="button" onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        type="button"
                        disabled={picked === null || busy}
                        onClick={() => void run()}
                        className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                    >
                        {t('bookmarksImport.import', 'Import')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BookmarksImportDialog;

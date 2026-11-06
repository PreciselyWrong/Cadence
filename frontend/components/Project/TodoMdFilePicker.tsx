import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../Shared/ToastContext';
import {
    fetchTodoMdFiles,
    linkTodoMdFile,
    TodoMdFile,
    unlinkTodoMdFile,
} from '../../utils/todoMdService';

interface TodoMdFilePickerProps {
    projectUid: string;
    sourcePath?: string | null;
    onChanged: () => Promise<void> | void;
}

const folderOf = (sourcePath?: string | null) =>
    sourcePath ? sourcePath.replace(/\/TODO\.md$/, '') : '';

// Which TODO.md feeds this project. Hidden when the server has no folder of
// TODO.md files, or for an account that does not own them.
const TodoMdFilePicker: React.FC<TodoMdFilePickerProps> = ({
    projectUid,
    sourcePath,
    onChanged,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [files, setFiles] = useState<TodoMdFile[]>([]);
    const [busy, setBusy] = useState(false);
    const current = folderOf(sourcePath);

    const load = async () => {
        try {
            setFiles(await fetchTodoMdFiles());
        } catch {
            setFiles([]);
        }
    };

    useEffect(() => {
        void load();
    }, [projectUid]);

    if (files.length === 0 && !current) return null;

    const choose = async (folder: string) => {
        if (busy || folder === current) return;
        setBusy(true);
        try {
            if (current) await unlinkTodoMdFile(projectUid);
            if (folder) await linkTodoMdFile(projectUid, folder);
        } catch {
            showErrorToast(
                t('todoMd.linkFailed', 'Could not change the TODO.md file.')
            );
        } finally {
            await onChanged();
            await load();
            setBusy(false);
        }
    };

    const known = files.some((file) => file.folder === current);

    return (
        <label className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-gray-600 dark:text-gray-300">
                {t('todoMd.fileLabel', 'TODO.md file')}
            </span>
            <select
                value={current}
                disabled={busy}
                onChange={(e) => void choose(e.target.value)}
                className="min-w-0 max-w-[60%] rounded-md border border-gray-200 bg-white px-1.5 py-1 text-sm text-gray-800 focus:outline-none disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                data-testid="todo-md-file"
            >
                <option value="">{t('todoMd.fileNone', 'None')}</option>
                {current && !known && (
                    <option value={current}>{sourcePath}</option>
                )}
                {files.map((file) => {
                    const taken =
                        file.project_uid !== null &&
                        file.project_uid !== projectUid;
                    return (
                        <option
                            key={file.folder}
                            value={file.folder}
                            disabled={taken}
                        >
                            {taken
                                ? `${file.path} (${file.project_name})`
                                : file.path}
                        </option>
                    );
                })}
            </select>
        </label>
    );
};

export default TodoMdFilePicker;

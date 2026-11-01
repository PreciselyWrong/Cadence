import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Project } from '../../entities/Project';

interface LinkProjectPickerProps {
    id: string;
    projects: Project[];
    // Try may create its task without a project; Attach needs one.
    allowNone: boolean;
    busy: boolean;
    onConfirm: (projectUid: string) => void;
}

// The project a link decision files its task in, then "Create task".
const LinkProjectPicker: React.FC<LinkProjectPickerProps> = ({
    id,
    projects,
    allowNone,
    busy,
    onConfirm,
}) => {
    const { t } = useTranslation();
    const [projectUid, setProjectUid] = useState('');

    return (
        <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
        >
            <label
                htmlFor={id}
                className="text-[12px] text-gray-600 dark:text-gray-300"
            >
                {t('links.tryProject', 'Project')}
            </label>
            <select
                id={id}
                value={projectUid}
                onChange={(e) => setProjectUid(e.target.value)}
                className="min-h-[32px] max-w-full rounded-md border border-gray-200 bg-white px-2 text-[13px] dark:border-gray-700 dark:bg-gray-900"
            >
                {allowNone ? (
                    <option value="">
                        {t('links.tryNoProject', 'No project')}
                    </option>
                ) : (
                    <option value="" disabled>
                        {t('links.attachPick', 'Choose a project')}
                    </option>
                )}
                {projects.map((project) => (
                    <option key={project.uid} value={project.uid}>
                        {project.name}
                    </option>
                ))}
            </select>
            <button
                type="button"
                disabled={busy || (!allowNone && !projectUid)}
                onClick={(e) => {
                    e.stopPropagation();
                    onConfirm(projectUid);
                }}
                className="min-h-[32px] rounded-full bg-blue-600 px-3 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500"
            >
                {t('links.tryCreate', 'Create task')}
            </button>
        </div>
    );
};

export default LinkProjectPicker;

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import {
    DormantProject,
    fetchDormantProjects,
} from '../../utils/projectsService';
import { keepProject } from '../../utils/reviewService';

const DAY_MS = 24 * 60 * 60 * 1000;

export const daysSince = (iso: string, now = new Date()): number =>
    Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);

// « Pas touché depuis 30 jours », folded at the bottom of Projects
// (docs/37-links.md): Keep marks the project reviewed; nothing is archived.
const DormantProjects: React.FC = () => {
    const { t } = useTranslation();
    const [projects, setProjects] = useState<DormantProject[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        fetchDormantProjects()
            .then(setProjects)
            .catch(() => setProjects([]));
    }, []);

    if (projects.length === 0) return null;

    const keep = async (uid: string) => {
        setProjects((list) => list.filter((p) => p.uid !== uid));
        await keepProject(uid).catch(() => undefined);
    };

    return (
        <section className="mt-8" data-testid="dormant-projects">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
                <ChevronRightIcon
                    aria-hidden
                    className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                />
                {t(
                    'projects.dormant.title',
                    'Not touched for 30 days ({{count}})',
                    { count: projects.length }
                )}
            </button>
            {open && (
                <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200/80 dark:divide-gray-800 dark:border-gray-800">
                    {projects.map((project) => (
                        <li
                            key={project.uid}
                            className="flex items-center gap-3 px-3 py-2"
                        >
                            <Link
                                to={`/project/${project.uid}`}
                                className="min-w-0 flex-1 truncate text-sm text-gray-900 hover:underline dark:text-gray-100"
                            >
                                {project.name}
                            </Link>
                            <span className="text-[12px] text-gray-500 dark:text-gray-400">
                                {t(
                                    'projects.dormant.daysAgo',
                                    '{{count}} days ago',
                                    {
                                        count: daysSince(
                                            project.last_activity_at
                                        ),
                                    }
                                )}
                            </span>
                            <button
                                type="button"
                                onClick={() => void keep(project.uid)}
                                className="text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                                {t('projects.dormant.keep', 'Keep')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default DormantProjects;

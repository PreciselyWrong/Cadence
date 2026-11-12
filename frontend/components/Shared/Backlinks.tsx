import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import {
    Backlink,
    BacklinkTargetType,
    fetchBacklinks,
} from '../../utils/contentLinksService';
import { openTaskPanel } from '../../store/taskPanelStore';

interface BacklinksProps {
    type: BacklinkTargetType;
    uid: string;
    className?: string;
}

const rowClass =
    'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-gray-800';

const BacklinkBody: React.FC<{ link: Backlink }> = ({ link }) => {
    const { t } = useTranslation();
    const Icon = link.type === 'note' ? DocumentTextIcon : CheckCircleIcon;
    return (
        <>
            <Icon
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400"
                aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {link.title || t('contentLinks.untitled', 'Untitled')}
                </span>
                {link.snippet && (
                    <span className="block line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
                        {link.snippet}
                    </span>
                )}
            </span>
        </>
    );
};

// The notes and tasks that link to this note, task or person. Shown only
// when there are some.
const Backlinks: React.FC<BacklinksProps> = ({ type, uid, className = '' }) => {
    const { t } = useTranslation();
    const [links, setLinks] = useState<Backlink[]>([]);

    useEffect(() => {
        let live = true;
        setLinks([]);
        fetchBacklinks(type, uid)
            .then((found) => live && setLinks(found))
            .catch(() => live && setLinks([]));
        return () => {
            live = false;
        };
    }, [type, uid]);

    if (links.length === 0) return null;

    return (
        <section
            className={`space-y-1 ${className}`}
            data-testid="backlinks"
            aria-label={t('contentLinks.backlinks', 'Backlinks')}
        >
            <h3 className="px-2 text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('contentLinks.backlinks', 'Backlinks')} ({links.length})
            </h3>
            <ul>
                {links.map((link) => (
                    <li key={`${link.type}:${link.uid}`}>
                        {link.type === 'note' ? (
                            <Link
                                to={`/notes/${link.uid}`}
                                className={rowClass}
                            >
                                <BacklinkBody link={link} />
                            </Link>
                        ) : (
                            <button
                                type="button"
                                className={rowClass}
                                onClick={() => openTaskPanel(link.uid)}
                            >
                                <BacklinkBody link={link} />
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default Backlinks;

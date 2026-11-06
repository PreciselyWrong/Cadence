import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowTopRightOnSquareIcon,
    ArrowUturnLeftIcon,
    StarIcon,
} from '@heroicons/react/24/outline';
import { Link } from '../../entities/Link';
import { Tag } from '../../entities/Tag';
import { sourcePath } from '../../utils/linkFilters';
import { toIntlLocale } from '../../utils/intlLocale';
import { LinkChanges } from '../../utils/linksService';
import { Project } from '../../entities/Project';
import LinkNote from './LinkNote';
import LinkActions from './LinkActions';

interface LinkCardProps {
    link: Link;
    onChange: (changes: LinkChanges) => Promise<unknown>;
    // The inline note; its failure is only reported.
    onNote?: (changes: LinkChanges) => Promise<unknown>;
    availableTags: Tag[];
    projects?: Project[];
    // One tap: a task that keeps the link's address.
    onTask?: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
}

const compactCount = (value: number, locale: string): string =>
    new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);

export const LinkKindBadge: React.FC<{ kind: Link['kind'] }> = ({ kind }) => {
    const { t } = useTranslation();
    if (kind === 'other') return null;
    const labels: Record<string, string> = {
        repo: t('links.kind.repo', 'Repo'),
        article: t('links.kind.article', 'Article'),
        video: t('links.kind.video', 'Video'),
        tool: t('links.kind.tool', 'Tool'),
    };
    return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
            {labels[kind]}
        </span>
    );
};

// Stars, language and last push of a GitHub repository, on one line.
export const GithubStats: React.FC<{ link: Link }> = ({ link }) => {
    const { t, i18n } = useTranslation();
    const locale = toIntlLocale(i18n.language);
    if (link.github_stars === null && !link.github_language) return null;
    const pushed = link.github_last_commit
        ? new Date(link.github_last_commit).toLocaleDateString(locale, {
              month: 'short',
              year: 'numeric',
          })
        : null;
    return (
        <span className="inline-flex flex-wrap items-center gap-x-2 text-[12px] text-gray-500 dark:text-gray-400">
            {link.github_stars !== null && (
                <span className="inline-flex items-center gap-0.5">
                    <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {compactCount(link.github_stars, locale)}
                </span>
            )}
            {link.github_language && <span>{link.github_language}</span>}
            {pushed && (
                <span>
                    {t('links.lastCommit', 'updated {{date}}', {
                        date: pushed,
                    })}
                </span>
            )}
        </span>
    );
};

// One saved link: what it is (title, two lines of description, domain,
// kind, GitHub stats, README start), what the user said about it (note,
// tags) and what to do with it (status, open, go to where it came from).
const LinkCard: React.FC<LinkCardProps> = ({
    link,
    onChange,
    onNote,
    availableTags,
    projects = [],
    onTask,
    onDelete,
}) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [imageFailed, setImageFailed] = useState(false);
    const title = link.title || link.domain || link.url;
    const description = link.description || link.readme_excerpt;
    const source = sourcePath(link);

    return (
        <article
            className={`flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200/80 bg-white p-4 dark:border-gray-700/70 dark:bg-gray-900 ${
                link.status === 'dropped' ? 'opacity-60' : ''
            }`}
            data-testid="link-card"
        >
            <div className="flex min-w-0 items-start gap-3">
                <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 group"
                >
                    <h3 className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-gray-900 group-hover:underline dark:text-gray-100">
                        {title}
                    </h3>
                    {description && (
                        <p className="mt-1 line-clamp-2 break-words text-[13px] leading-snug text-gray-600 dark:text-gray-300">
                            {description}
                        </p>
                    )}
                </a>
                {link.image_url && !imageFailed && (
                    <img
                        src={link.image_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setImageFailed(true)}
                        className="h-14 w-14 flex-shrink-0 rounded-lg object-cover bg-gray-100 dark:bg-gray-800"
                    />
                )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-500 dark:text-gray-400">
                <span className="truncate">{link.domain ?? link.url}</span>
                <LinkKindBadge kind={link.kind} />
                <GithubStats link={link} />
                {link.status === 'parked' && link.review_at && (
                    <span>
                        {t('links.reviewOn', 'Review on {{date}}', {
                            date: new Date(
                                `${link.review_at}T12:00:00`
                            ).toLocaleDateString(toIntlLocale(i18n.language), {
                                day: 'numeric',
                                month: 'short',
                            }),
                        })}
                    </span>
                )}
                {link.project_name && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {link.project_name}
                    </span>
                )}
                {link.fetch_status === 'pending' && (
                    <span>{t('links.fetching', 'Reading the page…')}</span>
                )}
            </div>

            {link.kind === 'repo' &&
                link.readme_excerpt &&
                link.readme_excerpt !== description && (
                    <p className="line-clamp-3 break-words text-[12px] leading-snug text-gray-500 dark:text-gray-400">
                        {link.readme_excerpt}
                    </p>
                )}

            <LinkNote
                note={link.note}
                onSave={(note) => (onNote ?? onChange)({ note })}
            />

            {link.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {link.tags.map((tag) => (
                        <span
                            key={tag.uid}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        >
                            #{tag.name}
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                <LinkActions
                    link={link}
                    projects={projects}
                    availableTags={availableTags}
                    onChange={onChange}
                    onTask={onTask}
                    onDelete={onDelete}
                />
                <span className="ml-auto flex items-center">
                    {source && (
                        <button
                            type="button"
                            onClick={() => navigate(source)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                            aria-label={t(
                                'links.goToSource',
                                'Go to where it was saved'
                            )}
                            title={t(
                                'links.goToSource',
                                'Go to where it was saved'
                            )}
                        >
                            <ArrowUturnLeftIcon className="h-4 w-4" />
                        </button>
                    )}
                    <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                        aria-label={t('links.open', 'Open the link')}
                        title={t('links.open', 'Open the link')}
                    >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                </span>
            </div>
        </article>
    );
};

export default LinkCard;

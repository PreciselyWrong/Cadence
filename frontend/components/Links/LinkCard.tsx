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
import { addressLabel } from '../../utils/linkTriage';
import { toIntlLocale } from '../../utils/intlLocale';
import { LinkChanges } from '../../utils/linksService';
import { Project } from '../../entities/Project';
import LinkNote from './LinkNote';
import LinkActions from './LinkActions';
import { IconButton } from '../Shared/ui/Button';

interface LinkCardProps {
    link: Link;
    onChange: (changes: LinkChanges) => Promise<unknown>;
    // The inline note; its failure is only reported.
    onNote?: (changes: LinkChanges) => Promise<unknown>;
    availableTags: Tag[];
    projects?: Project[];
    // A task that keeps the link's address; the link stays.
    onTask?: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
}

const compactCount = (value: number, locale: string): string =>
    new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);

// Stars, language and last push of a GitHub repository, on one line.
const GithubStats: React.FC<{ link: Link }> = ({ link }) => {
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
        <span className="inline-flex flex-wrap items-center gap-x-2">
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
// GitHub stats), what the user said about it (note, tags, project) and what
// to do with it (⋯, open, go to the task or note it came from).
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
    const [addingNote, setAddingNote] = useState(false);
    const title = link.title || addressLabel(link.url);
    const description = link.description || link.readme_excerpt;
    const source = sourcePath(link);

    const tagLine = link.tags.map((tag) => `#${tag.name}`).join(' ');

    // A row, as in every list: the page (thumbnail, title, one line of
    // description), then where it is from and what it is filed under, in
    // grey; the note only once written; actions behind ⋯.
    return (
        <article
            className={`group flex min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-high/60 ${
                link.status === 'dropped' ? 'opacity-60' : ''
            }`}
            data-testid="link-card"
        >
            {link.image_url && !imageFailed ? (
                <img
                    src={link.image_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-lg bg-surface-high object-cover"
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-lg bg-surface-high"
                />
            )}
            <div className="min-w-0 flex-1">
                <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block min-w-0"
                >
                    <h3 className="truncate text-body font-medium leading-6 text-surface-on hover:underline">
                        {title}
                    </h3>
                    {description && (
                        <p className="truncate text-body-m text-surface-on-variant">
                            {description}
                        </p>
                    )}
                </a>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-surface-on-variant">
                    <span className="truncate">{link.domain ?? link.url}</span>
                    <GithubStats link={link} />
                    {link.review_at && (
                        <span>
                            {t('links.reviewOn', 'Review on {{date}}', {
                                date: new Date(
                                    `${link.review_at}T12:00:00`
                                ).toLocaleDateString(
                                    toIntlLocale(i18n.language),
                                    { day: 'numeric', month: 'short' }
                                ),
                            })}
                        </span>
                    )}
                    {link.project_name && <span>{link.project_name}</span>}
                    {tagLine && <span>{tagLine}</span>}
                    {link.fetch_status === 'pending' && (
                        <span>{t('links.fetching', 'Reading the page…')}</span>
                    )}
                </div>
                {(link.note || addingNote) && (
                    <div className="mt-1">
                        <LinkNote
                            note={link.note}
                            startEditing={addingNote}
                            onDone={() => setAddingNote(false)}
                            onSave={(note) => (onNote ?? onChange)({ note })}
                        />
                    </div>
                )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
                {source && (
                    <IconButton
                        onClick={() => navigate(source)}
                        label={t(
                            'links.goToSource',
                            'Go to where it was saved'
                        )}
                    >
                        <ArrowUturnLeftIcon />
                    </IconButton>
                )}
                <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high hover:text-surface-on max-sm:h-11 max-sm:w-11"
                    aria-label={t('links.open', 'Open the link')}
                    title={t('links.open', 'Open the link')}
                >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
                <LinkActions
                    link={link}
                    projects={projects}
                    availableTags={availableTags}
                    onChange={onChange}
                    onTask={onTask}
                    onDelete={onDelete}
                    onAddNote={() => setAddingNote(true)}
                />
            </div>
        </article>
    );
};

export default LinkCard;

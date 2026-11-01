import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../entities/Link';
import { useLinksStore } from '../../store/linksStore';
import { useToast } from '../Shared/ToastContext';
import LinkNote from './LinkNote';
import { GithubStats, LinkKindBadge } from './LinkCard';

// The link of an inbox item: what the page is (title, one line of
// description, domain) and the user's note, editable in place.
const InboxLinkPreview: React.FC<{ link: Link }> = ({ link }) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const save = useLinksStore((s) => s.save);
    const [imageFailed, setImageFailed] = useState(false);
    const title = link.title || link.domain || link.url;
    const description = link.description || link.readme_excerpt;

    return (
        <div
            className="mt-2 flex min-w-0 flex-col gap-1.5"
            data-testid="inbox-link-preview"
        >
            <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex min-w-0 items-start gap-3 rounded-lg border border-gray-200/80 px-3 py-2 hover:bg-gray-50 dark:border-gray-700/70 dark:hover:bg-gray-800/60"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-gray-900 dark:text-gray-100">
                        {title}
                    </span>
                    {description && (
                        <span className="block truncate text-[12.5px] text-gray-600 dark:text-gray-300">
                            {description}
                        </span>
                    )}
                    <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] text-gray-500 dark:text-gray-400">
                        <span className="truncate">{link.domain}</span>
                        <LinkKindBadge kind={link.kind} />
                        <GithubStats link={link} />
                        {link.fetch_status === 'pending' && (
                            <span>
                                {t('links.fetching', 'Reading the page…')}
                            </span>
                        )}
                    </span>
                </span>
                {link.image_url && !imageFailed && (
                    <img
                        src={link.image_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setImageFailed(true)}
                        className="h-11 w-11 flex-shrink-0 rounded-md object-cover bg-gray-100 dark:bg-gray-800"
                    />
                )}
            </a>
            <LinkNote
                note={link.note}
                stopPropagation
                onSave={(note) =>
                    save(link.uid, { note }).catch(() =>
                        showErrorToast(
                            t('links.saveError', 'Could not save the link.')
                        )
                    )
                }
            />
        </div>
    );
};

export default InboxLinkPreview;

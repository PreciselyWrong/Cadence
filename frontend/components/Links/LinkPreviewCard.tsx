import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addressLabel, domainOf } from '../../utils/linkTriage';

interface LinkPreviewCardProps {
    url: string;
    title?: string | null;
    description?: string | null;
    image?: string | null;
    // Still reading the page.
    pending?: boolean;
    // One line under the site, e.g. GitHub stars, language, last push.
    stats?: string | null;
}

// What a page is: title, one line of description, site, picture. Opens the
// page; never opens what it sits in.
const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
    url,
    title,
    description,
    image,
    pending = false,
    stats = null,
}) => {
    const { t } = useTranslation();
    const [imageFailed, setImageFailed] = useState(false);
    const domain = domainOf(url);
    // Without a title the address itself names the page, and the site line
    // would only repeat it.
    const address = addressLabel(url);

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            data-testid="link-preview"
            className="mt-2 flex min-w-0 items-start gap-3 rounded-lg border border-gray-200/80 px-3 py-2 hover:bg-gray-50 dark:border-gray-700/70 dark:hover:bg-gray-800/60"
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-gray-900 dark:text-gray-100">
                    {title || address}
                </span>
                {description && (
                    <span className="block truncate text-[12.5px] text-gray-600 dark:text-gray-300">
                        {description}
                    </span>
                )}
                {(pending || title) && (
                    <span className="mt-0.5 block truncate text-[12px] text-gray-500 dark:text-gray-400">
                        {pending
                            ? t('links.fetching', 'Reading the page…')
                            : domain}
                    </span>
                )}
                {stats && (
                    <span className="mt-0.5 block truncate text-[12px] text-gray-500 dark:text-gray-400">
                        {stats}
                    </span>
                )}
            </span>
            {image && !imageFailed && (
                <img
                    src={image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    className="h-11 w-11 flex-shrink-0 rounded-md object-cover bg-gray-100 dark:bg-gray-800"
                />
            )}
        </a>
    );
};

export default LinkPreviewCard;

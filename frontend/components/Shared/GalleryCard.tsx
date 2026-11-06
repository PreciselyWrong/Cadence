import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TaskTagChips from '../Task/TaskRow/TaskTagChips';

interface GalleryTag {
    uid?: string;
    name: string;
    color?: string | null;
}

interface GalleryCardProps {
    title: string;
    image?: string | null;
    // A short line under the title, such as the site of a link.
    meta?: string | null;
    // Shown in place of the picture when there is none.
    excerpt?: string | null;
    tags?: GalleryTag[];
    // An outside page (new tab) or a route of the app.
    href?: string;
    to?: string;
    dimmed?: boolean;
    // Controls under the card, outside what its click opens.
    footer?: React.ReactNode;
}

// One card of a gallery: the picture first, then the title, a quiet line
// and the tags. Without a picture, the start of the text or the initial.
const GalleryCard: React.FC<GalleryCardProps> = ({
    title,
    image,
    meta,
    excerpt,
    tags = [],
    href,
    to,
    dimmed = false,
    footer,
}) => {
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = !!image && !imageFailed;
    const initial = (meta || title).trim().charAt(0).toUpperCase();

    const body = (
        <>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-xl bg-gray-100 dark:bg-gray-800">
                {showImage ? (
                    <img
                        src={image as string}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setImageFailed(true)}
                        className="h-full w-full object-cover"
                        data-testid="gallery-card-image"
                    />
                ) : excerpt ? (
                    <p className="line-clamp-5 p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                        {excerpt}
                    </p>
                ) : (
                    <span
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center text-3xl font-light text-gray-400 dark:text-gray-500"
                    >
                        {initial}
                    </span>
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-1 p-3">
                <h3 className="line-clamp-2 break-words text-sm font-medium leading-snug text-gray-900 group-hover:underline dark:text-gray-100">
                    {title}
                </h3>
                {meta && (
                    <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {meta}
                    </span>
                )}
                {tags.length > 0 && (
                    <TaskTagChips tags={tags} max={3} className="mt-1" />
                )}
            </div>
        </>
    );

    const cardClass = `group flex min-w-0 flex-col rounded-xl border border-gray-200/80 bg-white transition-shadow hover:shadow-sm dark:border-gray-700/70 dark:bg-gray-900 ${
        dimmed ? 'opacity-60' : ''
    }`;

    return (
        <article className="min-w-0" data-testid="gallery-card">
            {href ? (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cardClass}
                >
                    {body}
                </a>
            ) : (
                <Link to={to ?? '#'} className={cardClass}>
                    {body}
                </Link>
            )}
            {footer && <div className="px-1 pt-1.5">{footer}</div>}
        </article>
    );
};

export default GalleryCard;

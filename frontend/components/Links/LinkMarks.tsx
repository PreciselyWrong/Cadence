import React, { useEffect, useState } from 'react';
import { useUrlPreview } from '../../hooks/useUrlPreview';
import { faviconUrl } from '../../utils/linksService';
import { UrlPreview } from '../../utils/urlService';
import { Task } from '../../entities/Task';
import { TaskLink, taskLinkOf } from './taskLink';

// The site's icon, as the server keeps it; nothing when it has none.
export const SiteIcon: React.FC<{ url: string; className?: string }> = ({
    url,
    className = 'h-3.5 w-3.5',
}) => {
    const src = faviconUrl(url);
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (!src || failed) return null;
    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            data-testid="site-icon"
            onError={() => setFailed(true)}
            className={`flex-shrink-0 rounded-[3px] object-contain ${className}`}
        />
    );
};

// The page's picture, at the 1.91:1 of the pictures pages share: small
// beside a row, a cover on a card. Nothing without one.
export const LinkThumb: React.FC<{
    image?: string | null;
    className?: string;
}> = ({ image, className = 'h-[34px] w-16' }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [image]);
    if (!image || failed) return null;
    return (
        <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            data-testid="link-thumb"
            onError={() => setFailed(true)}
            className={`flex-shrink-0 rounded-md bg-surface-high object-cover ${className}`}
        />
    );
};

// The site in words: its own name when the page gives one, else the host.
export const siteNameOf = (link: TaskLink, preview: UrlPreview | null) =>
    preview?.siteName?.trim() || link.host;

// The site of a task's link, in place of the raw address: a click opens
// the page in a new tab, without opening or dragging the task.
export const SiteLine: React.FC<{
    link: TaskLink;
    preview: UrlPreview | null;
    className?: string;
}> = ({ link, preview, className = '' }) => (
    <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        title={link.url}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={`flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded text-xs text-surface-on-variant hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary ${className}`}
        data-testid="task-site"
    >
        {!link.iconInBadge && <SiteIcon url={link.url} />}
        <span className="truncate">{siteNameOf(link, preview)}</span>
    </a>
);

// A task's link and what the server read of the page (null while it
// reads, or for a task without an address).
export const useTaskLink = (
    task: Task
): { link: TaskLink | null; preview: UrlPreview | null } => {
    const link = taskLinkOf(task);
    const preview = useUrlPreview(link?.url ?? null);
    return { link, preview: link ? preview : null };
};

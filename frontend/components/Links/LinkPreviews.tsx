import React, { useMemo } from 'react';
import LinkPreviewCard from './LinkPreviewCard';
import { useUrlPreview } from '../../hooks/useUrlPreview';
import { UrlPreview } from '../../utils/urlService';

const MAX_SHOWN = 5;

const CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?'"»…*_)\]]+$/;

// The addresses written in `texts`, once each, in order.
export function addressesIn(texts: (string | null | undefined)[]): string[] {
    const found: string[] = [];
    for (const text of texts) {
        for (const match of (text || '').matchAll(CANDIDATE)) {
            const url = match[0].replace(TRAILING, '');
            if (!found.includes(url)) found.push(url);
        }
    }
    return found;
}

// « ★ 1.2k · Rust · 2026-11-01 » for a GitHub repository, else nothing.
export const githubLine = (preview: UrlPreview | null): string | null => {
    if (!preview || preview.githubStars == null) return null;
    const stars =
        preview.githubStars >= 1000
            ? `${(preview.githubStars / 1000).toFixed(1).replace(/\.0$/, '')}k`
            : String(preview.githubStars);
    return [
        `★ ${stars}`,
        preview.githubLanguage,
        preview.githubLastCommit?.slice(0, 10),
    ]
        .filter(Boolean)
        .join(' · ');
};

const AddressCard: React.FC<{ url: string }> = ({ url }) => {
    const preview = useUrlPreview(url);
    return (
        <LinkPreviewCard
            url={url}
            title={preview?.title}
            description={preview?.description}
            image={preview?.image}
            pending={!preview}
            stats={githubLine(preview)}
        />
    );
};

// A card for each address written in a task, a note or a project
// description (docs/37-links.md, Previews), read by the server and kept
// by address.
const LinkPreviews: React.FC<{
    texts: (string | null | undefined)[];
    className?: string;
}> = ({ texts, className }) => {
    const written = texts.filter(Boolean).join('\n');
    const urls = useMemo(
        () => addressesIn([written]).slice(0, MAX_SHOWN),
        [written]
    );
    if (urls.length === 0) return null;
    return (
        <div className={className} data-testid="link-previews">
            {urls.map((url) => (
                <AddressCard key={url} url={url} />
            ))}
        </div>
    );
};

export default LinkPreviews;

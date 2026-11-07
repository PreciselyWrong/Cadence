import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import { addLinkFrom } from '../../utils/linksService';

const CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?'"»…*_)\]]+$/;
const MAX_SHOWN = 5;

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

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

interface AddToLinksProps {
    sourceType: 'task' | 'note';
    sourceUid: string;
    texts: (string | null | undefined)[];
}

// An address in a task or a note is its context and stays out of the
// library (docs/37-links.md); this row adds one on purpose.
const AddToLinks: React.FC<AddToLinksProps> = ({
    sourceType,
    sourceUid,
    texts,
}) => {
    const { t } = useTranslation();
    const written = texts.filter(Boolean).join('\n');
    const urls = useMemo(
        () => addressesIn([written]).slice(0, MAX_SHOWN),
        [written]
    );
    const [saved, setSaved] = useState<Record<string, boolean>>({});
    const [failed, setFailed] = useState(false);

    if (urls.length === 0) return null;

    const add = async (url: string) => {
        try {
            await addLinkFrom(url, { type: sourceType, uid: sourceUid });
            setSaved((current) => ({ ...current, [url]: true }));
            setFailed(false);
        } catch {
            setFailed(true);
        }
    };

    return (
        <div
            className="flex flex-wrap items-center gap-1.5"
            data-testid="add-to-links"
        >
            {urls.map((url) =>
                saved[url] ? (
                    <span
                        key={url}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs text-gray-500 dark:text-gray-400"
                    >
                        <CheckIcon className="h-3.5 w-3.5" />
                        {t('links.inLinks', 'In links')} · {hostOf(url)}
                    </span>
                ) : (
                    <button
                        key={url}
                        type="button"
                        onClick={() => void add(url)}
                        title={url}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    >
                        <PlusIcon className="h-3.5 w-3.5" />
                        {t('links.addToLinks', 'Add to links')} · {hostOf(url)}
                    </button>
                )
            )}
            {failed && (
                <span
                    role="alert"
                    className="text-xs text-red-600 dark:text-red-400"
                >
                    {t('links.saveError', 'Could not save the link.')}
                </span>
            )}
        </div>
    );
};

export default AddToLinks;

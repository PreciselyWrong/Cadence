import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InboxItem } from '../../entities/InboxItem';
import { Project } from '../../entities/Project';
import { useLinksStore } from '../../store/linksStore';
import { linkForItem } from '../../utils/linkFilters';
import InboxLinkPreview from './InboxLinkPreview';
import LinkTriageActions from './LinkTriageActions';

interface LinkSorterProps {
    items: InboxItem[];
    projects: Project[];
    onExit: () => void;
}

// "Sort links": one inbox link at a time, full width, with the four
// decisions and "Skip". A skipped link goes to the end of the queue; a
// decided one leaves the inbox and the queue on its own.
const LinkSorter: React.FC<LinkSorterProps> = ({ items, projects, onExit }) => {
    const { t } = useTranslation();
    const savedLinks = useLinksStore((state) => state.links);
    const [skipped, setSkipped] = useState<string[]>([]);

    const open = items.filter(
        (item) => item.uid && !skipped.includes(item.uid)
    );
    const passed = skipped
        .map((uid) => items.find((item) => item.uid === uid))
        .filter((item): item is InboxItem => Boolean(item));
    const queue = [...open, ...passed];
    const current = queue[0];
    const link =
        current && linkForItem(savedLinks, current.uid, current.content);

    if (!current || !link) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-16 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('links.sort.done', 'No link left to sort.')}
                </p>
                <button
                    type="button"
                    onClick={onExit}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                    {t('links.sort.exit', 'Back to the inbox')}
                </button>
            </div>
        );
    }

    return (
        <div
            className="mx-auto w-full max-w-2xl space-y-4"
            data-testid="link-sorter"
        >
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                <span>
                    {t('links.sort.left', '{{count}} left', {
                        count: queue.length,
                    })}
                </span>
                <button
                    type="button"
                    onClick={onExit}
                    className="hover:underline"
                >
                    {t('links.sort.exit', 'Back to the inbox')}
                </button>
            </div>
            <InboxLinkPreview key={current.uid} link={link} />
            <LinkTriageActions
                key={`${current.uid}-actions`}
                item={current}
                link={link}
                projects={projects}
            />
            <button
                type="button"
                onClick={() =>
                    setSkipped((uids) => [...uids, current.uid as string])
                }
                className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
            >
                {t('links.sort.skip', 'Skip')}
            </button>
        </div>
    );
};

export default LinkSorter;

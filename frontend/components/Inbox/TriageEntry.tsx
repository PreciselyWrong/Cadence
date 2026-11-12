import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchTriageQueue } from '../../utils/triageService';

// The way into « À trier » from the Inbox: the classifier's cards, duplicate
// links and links to review would otherwise only be reached from Ma journée,
// and a card left unseen expires.
const TriageEntry: React.FC = () => {
    const { t } = useTranslation();
    const [count, setCount] = useState(0);

    useEffect(() => {
        let alive = true;
        fetchTriageQueue()
            .then((queue) => alive && setCount(queue.items.length))
            .catch(() => alive && setCount(0));
        return () => {
            alive = false;
        };
    }, []);

    if (count === 0) return null;
    return (
        <Link
            to="/triage"
            data-testid="inbox-to-sort"
            className="inline-flex h-7 items-center rounded-lg px-2.5 text-body-m font-medium text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 max-sm:min-h-[44px]"
        >
            {t('inbox.toSort', 'À trier ({{count}})', { count })}
        </Link>
    );
};

export default TriageEntry;

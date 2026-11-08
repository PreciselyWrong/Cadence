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
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 dark:text-amber-200 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
            {t('inbox.toSort', 'À trier ({{count}})', { count })}
        </Link>
    );
};

export default TriageEntry;

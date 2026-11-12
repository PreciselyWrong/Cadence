import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

// `?classic=1` keeps the list the page showed before the board.
const Tasks = lazy(() => import('../Tasks'));
const UpcomingBoard = lazy(() => import('./UpcomingBoard'));

const UpcomingRoute: React.FC = () => {
    const [params] = useSearchParams();
    return (
        <Suspense fallback={<div className="p-4" />}>
            {params.get('classic') === '1' ? <Tasks /> : <UpcomingBoard />}
        </Suspense>
    );
};

export default UpcomingRoute;

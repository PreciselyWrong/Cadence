import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

// True on phone widths (under Tailwind's `md`), following window resizes.
export const useIsNarrow = (): boolean => {
    const [narrow, setNarrow] = useState(
        () =>
            typeof window !== 'undefined' &&
            !!window.matchMedia?.(QUERY).matches
    );
    useEffect(() => {
        const media = window.matchMedia?.(QUERY);
        if (!media) return;
        const update = () => setNarrow(media.matches);
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, []);
    return narrow;
};

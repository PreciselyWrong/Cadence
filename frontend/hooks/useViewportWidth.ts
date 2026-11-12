import { useEffect, useState } from 'react';

// The window's width in px, following resizes (0 before a window exists).
export const useViewportWidth = (): number => {
    const [width, setWidth] = useState(() =>
        typeof window === 'undefined' ? 0 : window.innerWidth
    );
    useEffect(() => {
        const update = () => setWidth(window.innerWidth);
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return width;
};

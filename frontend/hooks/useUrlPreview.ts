import { useEffect, useState } from 'react';
import { fetchUrlPreview, UrlPreview } from '../utils/urlService';

// The preview of an address, read by the server (null while it reads, or
// without an address).
export const useUrlPreview = (url: string | null): UrlPreview | null => {
    const [preview, setPreview] = useState<UrlPreview | null>(null);

    useEffect(() => {
        setPreview(null);
        if (!url) return;
        let cancelled = false;
        fetchUrlPreview(url).then((result) => {
            if (!cancelled) setPreview(result);
        });
        return () => {
            cancelled = true;
        };
    }, [url]);

    return preview;
};

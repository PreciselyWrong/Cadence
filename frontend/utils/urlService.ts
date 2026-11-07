import { handleAuthResponse, getPostHeadersWithCsrf } from './authUtils';
import { getApiPath } from '../config/paths';

export interface UrlTitleResult {
    url: string;
    title: string | null;
    image?: string | null;
    description?: string | null;
    site_name?: string | null;
    found?: boolean;
    error?: string;
}

export const extractUrlTitle = async (url: string): Promise<UrlTitleResult> => {
    try {
        const response = await fetch(
            getApiPath(`url/title?url=${encodeURIComponent(url)}`),
            {
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                },
            }
        );

        await handleAuthResponse(response, 'Failed to extract URL title');
        return await response.json();
    } catch (error) {
        console.error('Error extracting URL title:', error);
        return { url, title: null, error: (error as Error).message };
    }
};

// What a page says about itself, before any link exists (the inbox panel).
export interface UrlPreview {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
}

const previews = new Map<string, Promise<UrlPreview>>();

const isHostName = (text: string, url: string): boolean => {
    try {
        const host = new URL(url).hostname.replace(/^www\./i, '');
        return text.toLowerCase().replace(/^www\./, '') === host.toLowerCase();
    } catch {
        return false;
    }
};

// Read once per address and session; a failed read is tried again later.
export const fetchUrlPreview = (url: string): Promise<UrlPreview> => {
    const cached = previews.get(url);
    if (cached) return cached;
    const preview = extractUrlTitle(url).then((result) => {
        if (result.error) previews.delete(url);
        const title = result.title?.trim() || null;
        return {
            url,
            // The server falls back to the host name: that is no title.
            title: title && !isHostName(title, url) ? title : null,
            description: result.description?.trim() || null,
            image: result.image || null,
            siteName: result.site_name || null,
        };
    });
    previews.set(url, preview);
    return preview;
};

// The preview if it comes within `ms`, else nothing: a decision never waits
// long for a slow page.
export const urlPreviewWithin = (
    url: string,
    ms = 3000
): Promise<UrlPreview | null> =>
    Promise.race([
        fetchUrlPreview(url),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);

export const extractTitleFromText = async (
    text: string
): Promise<UrlTitleResult | null> => {
    try {
        const response = await fetch(getApiPath('url/extract-from-text'), {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify({ text }),
        });

        await handleAuthResponse(response, 'Failed to extract title from text');
        const result = await response.json();

        if (result.found === false) {
            return null;
        }

        return result;
    } catch (error) {
        console.error('Error extracting title from text:', error);
        return null;
    }
};

export const isUrl = (text: string): boolean => {
    const trimmed = text.trim();

    if (!trimmed || trimmed.length > 2000 || !trimmed.includes('.')) {
        return false;
    }

    const urlRegex =
        /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:[0-9]+)?(\/\S*)?$/i;
    return urlRegex.test(trimmed);
};

const WEB_LOCATION = /^https?:\/\/\S+$/i;

// A location that is only a web address (a meeting link) opens as is.
export const isWebLocation = (location: string): boolean =>
    WEB_LOCATION.test(location.trim());

export const mapsSearchUrl = (address: string): string =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address.trim()
    )}`;

export const locationHref = (location: string): string =>
    isWebLocation(location) ? location.trim() : mapsSearchUrl(location);

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;
const MEETING_HOST =
    /^(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us|teams\.microsoft\.com|teams\.live\.com|([a-z0-9-]+\.)?webex\.com)$/i;

const meetingUrlIn = (text: string): string | null => {
    for (const match of text.matchAll(URL_IN_TEXT)) {
        try {
            const url = new URL(match[0]);
            if (MEETING_HOST.test(url.hostname)) return match[0];
        } catch {
            // Not a parseable URL: keep looking.
        }
    }
    return null;
};

// The first Meet, Zoom, Teams or Webex link, looking at the location first.
export const findMeetingLink = (
    location: string | null | undefined,
    description: string | null | undefined
): string | null =>
    meetingUrlIn(location ?? '') ?? meetingUrlIn(description ?? '');

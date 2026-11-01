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

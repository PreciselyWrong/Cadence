import {
    isWebLocation,
    locationHref,
    mapsSearchUrl,
} from '../Calendar/eventLocation';

describe('event location', () => {
    it('recognises a web link but not a plain address', () => {
        expect(isWebLocation('https://meet.example.com/abc-def')).toBe(true);
        expect(isWebLocation('  http://exemple.ch/salle  ')).toBe(true);
        expect(isWebLocation('Rue du Lac 4, 1800 Vevey')).toBe(false);
        expect(isWebLocation('https://exemple.ch et la salle 2')).toBe(false);
        expect(isWebLocation('www.exemple.ch')).toBe(false);
    });

    it('builds a Google Maps search URL with the address encoded', () => {
        expect(mapsSearchUrl('Rue du Lac 4, 1800 Vevey')).toBe(
            'https://www.google.com/maps/search/?api=1&query=Rue%20du%20Lac%204%2C%201800%20Vevey'
        );
    });

    it('opens a web link as is and an address in Maps', () => {
        expect(locationHref('https://meet.example.com/x')).toBe(
            'https://meet.example.com/x'
        );
        expect(locationHref('Salle A & B')).toBe(
            'https://www.google.com/maps/search/?api=1&query=Salle%20A%20%26%20B'
        );
    });
});

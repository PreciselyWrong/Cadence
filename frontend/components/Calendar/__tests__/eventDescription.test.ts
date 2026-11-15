import { eventDescriptionText } from '../eventDescription';

describe('eventDescriptionText', () => {
    it('turns Google HTML into plain lines, one per paragraph', () => {
        expect(
            eventDescriptionText(
                '<p>SORTIE FAMILIALE</p>\n<p>Visite de la Maison.<br>Parking gratuit.</p><p>Billets : https://example.com/visite</p>'
            )
        ).toBe(
            'SORTIE FAMILIALE\n\nVisite de la Maison.\nParking gratuit.\n\nBillets : https://example.com/visite'
        );
    });

    it('decodes entities and keeps list items on their own line', () => {
        expect(
            eventDescriptionText('<ul><li>A &amp; B</li><li>C</li></ul>')
        ).toBe('A & B\nC');
    });

    it('leaves plain text as it is', () => {
        expect(eventDescriptionText('Line 1\nLine 2 < 3')).toBe(
            'Line 1\nLine 2 < 3'
        );
        expect(eventDescriptionText(null)).toBe('');
    });
});

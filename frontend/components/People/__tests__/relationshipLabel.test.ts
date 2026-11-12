import { relationshipLabel } from '../relationshipLabel';

describe('relationshipLabel', () => {
    const t = jest.fn((key: string, fallback: string) =>
        key === 'people.relationships.family' ? 'Famille' : fallback
    );

    it('names the relationship in the user language', () => {
        expect(relationshipLabel('family', t)).toBe('Famille');
        expect(t).toHaveBeenCalledWith('people.relationships.family', 'Family');
    });

    it('treats a missing relationship as other', () => {
        expect(relationshipLabel(undefined, t)).toBe('Other');
    });
});

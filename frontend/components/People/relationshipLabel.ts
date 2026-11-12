import { RelationshipType } from '../../entities/Person';

const FALLBACK: Record<RelationshipType, string> = {
    family: 'Family',
    work: 'Work',
    friend: 'Friend',
    other: 'Other',
};

export const RELATIONSHIP_TYPES = Object.keys(FALLBACK) as RelationshipType[];

// How a contact relates to the user, in the user's language; a person
// without one counts as "other".
export const relationshipLabel = (
    type: RelationshipType | null | undefined,
    t: (key: string, fallback: string) => string
): string => {
    const key = type ?? 'other';
    return t(`people.relationships.${key}`, FALLBACK[key]);
};

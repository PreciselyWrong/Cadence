import React from 'react';
import PageHeader from '../Shared/ui/PageHeader';
import EntityMark from '../Shared/ui/EntityMark';

interface PersonHeroProps {
    name: string;
    color?: string | null;
    meta: React.ReactNode;
    /** Contact details and notes, under the title. */
    description?: React.ReactNode;
    actions: React.ReactNode;
}

// The shared page header, as on a project or a tag: no tinted card, the
// person's icon in their colour, one action and the rest under ⋯.
const PersonHero: React.FC<PersonHeroProps> = ({
    name,
    color,
    meta,
    description,
    actions,
}) => (
    <PageHeader
        className="mb-2"
        leading={<EntityMark kind="person" color={color} className="h-6 w-6" />}
        title={<span data-testid="person-name">{name}</span>}
        meta={meta}
        actions={actions}
    >
        {description}
    </PageHeader>
);

export default PersonHero;

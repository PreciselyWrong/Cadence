import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserIcon } from '@heroicons/react/24/outline';
import { Person } from '../../entities/Person';
import { memberRoleLabel } from './memberRoleLabel';
import ListRow from '../Shared/ui/ListRow';
import EntityMark from '../Shared/ui/EntityMark';

const RELATIONSHIP_LABELS: Record<string, string> = {
    family: 'Family',
    work: 'Work',
    friend: 'Friend',
    other: 'Other',
};

interface PersonRowProps {
    person: Person;
}

// One person in a list, the same row as the area and tag lists: their
// colour as a dot, the name, then their role, e-mail and state in grey.
const PersonRow: React.FC<PersonRowProps> = ({ person }) => {
    const { t } = useTranslation();
    const isMember = person.kind === 'member';

    const kindLabel = isMember
        ? person.account_status === 'no_sign_in'
            ? t('people.memberNoSignIn', "Member, can't sign in yet")
            : memberRoleLabel(person, t)
        : RELATIONSHIP_LABELS[person.relationship_type ?? 'other'];

    return (
        <ListRow
            to={`/person/${person.uid}`}
            testId={`person-row-${person.uid}`}
            leading={<EntityMark kind="person" color={person.color} />}
            muted={!!person.archived}
            title={
                <span className="inline-flex max-w-full items-center gap-1.5">
                    <span className="truncate">{person.name}</span>
                    {person.linked_user_id != null && (
                        <UserIcon
                            className="h-3.5 w-3.5 shrink-0 text-surface-on-variant"
                            title={t(
                                'people.linkedAccount',
                                'Linked to a user account'
                            )}
                        />
                    )}
                </span>
            }
            meta={[
                kindLabel,
                person.email,
                person.archived ? t('people.archivedBadge', 'archived') : null,
            ]
                .filter(Boolean)
                .join(' · ')}
        />
    );
};

export default PersonRow;

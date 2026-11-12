import React, { useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import PersonModal from './PersonModal';
import PersonRow from './PersonRow';
import PageHeader from '../Shared/ui/PageHeader';
import Button from '../Shared/ui/Button';
import Segmented from '../Shared/ui/Segmented';
import { Person } from '../../entities/Person';
import {
    fetchPeople,
    createPerson,
    updatePerson,
} from '../../utils/peopleService';
import { useToast } from '../Shared/ToastContext';
import { useTranslation } from 'react-i18next';
import { useCan } from '../../hooks/useCan';
import { useStore } from '../../store/useStore';
import MemberModal from './MemberModal';
import TrialLockNotice from '../Billing/TrialLockNotice';
import { useTrialLock } from '../../hooks/useTrialStatus';
import { CreatedMember } from '../../utils/membersService';

type PeopleFilter = 'all' | 'members' | 'contacts';

const PeopleList: React.FC = () => {
    const { showSuccessToast, showErrorToast } = useToast();
    const [people, setPeople] = useState<Person[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingPerson, setEditingPerson] = useState<Person | null>(null);
    const { t } = useTranslation();
    const canCreatePeople = useCan('create_people');
    const membersLocked = useTrialLock('members');
    const canInvite = useCan('invite_members') && !membersLocked;
    const [filter, setFilter] = useState<PeopleFilter>('all');
    const [memberModal, setMemberModal] = useState<{
        open: boolean;
        person: Person | null;
    }>({
        open: false,
        person: null,
    });

    const load = async () => {
        setIsLoading(true);
        try {
            const all = await fetchPeople({ archived: false } as any);
            setPeople(all);
        } catch {
            showErrorToast('Failed to load people');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleSave = async (data: Partial<Person>) => {
        if (editingPerson?.uid) {
            const result = await updatePerson(editingPerson.uid, data);
            setPeople((prev) =>
                prev.map((p) =>
                    p.uid === editingPerson.uid ? result.person : p
                )
            );
            showSuccessToast('Person updated');
        } else {
            const result = await createPerson(data as any);
            setPeople((prev) =>
                [...prev, result.person].sort((a, b) =>
                    a.name.localeCompare(b.name)
                )
            );
            showSuccessToast('Person created');
        }
    };

    const openCreate = () => {
        setEditingPerson(null);
        setModalOpen(true);
    };

    const visiblePeople = people.filter((p) => !p.archived);
    const memberCount = visiblePeople.filter((p) => p.kind === 'member').length;
    const contactCount = visiblePeople.length - memberCount;
    const displayPeople = visiblePeople.filter((p) =>
        filter === 'all'
            ? true
            : filter === 'members'
              ? p.kind === 'member'
              : p.kind !== 'member'
    );

    const openMember = (person: Person | null = null) =>
        setMemberModal({ open: true, person });

    // A new member shows up in the list and in every assignee list.
    const handleMemberCreated = async (member: CreatedMember) => {
        showSuccessToast(
            member.invited && member.email_sent
                ? t('people.memberInvited', 'Invitation sent to {{email}}', {
                      email: member.email,
                  })
                : t('people.memberAdded', 'Member added')
        );
        await load();
        useStore.getState().peopleStore.loadPeople(true);
    };

    const groupedPeople = displayPeople.reduce(
        (groups, person) => {
            const firstLetter = person.name.charAt(0).toUpperCase();
            if (!groups[firstLetter]) groups[firstLetter] = [];
            groups[firstLetter].push(person);
            return groups;
        },
        {} as Record<string, Person[]>
    );

    const sortedGroupKeys = Object.keys(groupedPeople).sort();
    sortedGroupKeys.forEach((letter) => {
        groupedPeople[letter].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
    });

    return (
        <div className="mx-auto w-full max-w-4xl pb-8">
            <PageHeader
                title={t('people.title', 'People')}
                actions={
                    <>
                        {canInvite && (
                            <Button
                                onClick={() => openMember()}
                                data-testid="add-member-button"
                                icon={<PlusIcon className="h-4 w-4" />}
                            >
                                {t('people.addMember', 'Add member')}
                            </Button>
                        )}
                        {canCreatePeople && (
                            <Button
                                variant="primary"
                                onClick={openCreate}
                                data-testid="add-contact-button"
                                icon={<PlusIcon className="h-4 w-4" />}
                            >
                                {t('people.newContact', 'New contact')}
                            </Button>
                        )}
                    </>
                }
            >
                <TrialLockNotice feature="members" className="mb-3" />
                <div data-testid="people-filters">
                    <Segmented
                        selected={filter}
                        onSelect={(id) => setFilter(id as PeopleFilter)}
                        options={[
                            {
                                id: 'all',
                                label: t('people.filterAll', 'All'),
                                count: visiblePeople.length,
                                testId: 'people-filter-all',
                            },
                            {
                                id: 'members',
                                label: t('people.filterMembers', 'Members'),
                                count: memberCount,
                                testId: 'people-filter-members',
                            },
                            {
                                id: 'contacts',
                                label: t('people.filterContacts', 'Contacts'),
                                count: contactCount,
                                testId: 'people-filter-contacts',
                            },
                        ]}
                    />
                </div>
            </PageHeader>

            <div className="px-3 max-sm:px-1">
                {isLoading ? (
                    <div className="px-3 py-6 text-body-m text-surface-on-variant">
                        {t('common.loading', 'Loading...')}
                    </div>
                ) : displayPeople.length === 0 ? (
                    <div className="px-3 py-6">
                        <p className="text-body-m text-surface-on-variant">
                            {t(
                                'people.empty',
                                'No people yet. Add family, colleagues, or friends.'
                            )}
                        </p>
                        <Button className="mt-3" onClick={openCreate}>
                            {t('people.addFirst', 'Add your first person')}
                        </Button>
                    </div>
                ) : (
                    <div role="list">
                        {sortedGroupKeys.flatMap((letter) =>
                            groupedPeople[letter].map((person) => (
                                <PersonRow key={person.uid} person={person} />
                            ))
                        )}
                    </div>
                )}

                {modalOpen && (
                    <PersonModal
                        person={editingPerson}
                        onSave={handleSave}
                        onClose={() => setModalOpen(false)}
                    />
                )}

                {memberModal.open && (
                    <MemberModal
                        person={memberModal.person}
                        onCreated={handleMemberCreated}
                        onClose={() =>
                            setMemberModal({ open: false, person: null })
                        }
                    />
                )}
            </div>
        </div>
    );
};

export default PeopleList;

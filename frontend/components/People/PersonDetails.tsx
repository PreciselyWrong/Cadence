import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    PencilSquareIcon,
    TrashIcon,
    ArchiveBoxIcon,
    EllipsisHorizontalIcon,
    EnvelopeIcon,
    PhoneIcon,
    LinkIcon,
} from '@heroicons/react/24/outline';
import { Person } from '../../entities/Person';
import { Task } from '../../entities/Task';
import {
    fetchPersonByUid,
    updatePerson,
    deletePerson,
} from '../../utils/peopleService';
import { useToast } from '../Shared/ToastContext';
import PersonModal from './PersonModal';
import PersonHero from './PersonHero';
import Backlinks from '../Shared/Backlinks';
import SignInLinkModal from './SignInLinkModal';
import MemberEditModal from './MemberEditModal';
import MemberRemoveDialog from './MemberRemoveDialog';
import { removeMember } from '../../utils/membersService';
import ConfirmDialog from '../Shared/ConfirmDialog';
import TaskList from '../Task/TaskList';
import { useStore } from '../../store/useStore';
import { memberRoleLabel } from './memberRoleLabel';
import PageShell, { PAGE_GUTTER } from '../Shared/ui/PageShell';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry, MenuItem } from '../Shared/ui/Menu';
import EmptyState from '../Shared/ui/EmptyState';

const RELATIONSHIP_LABELS: Record<string, string> = {
    family: 'Family',
    work: 'Work',
    friend: 'Friend',
    other: 'Other',
};

const PersonDetails: React.FC = () => {
    const { uid } = useParams<{ uid: string }>();
    const navigate = useNavigate();
    const { showSuccessToast, showErrorToast } = useToast();
    const { t } = useTranslation();

    const [person, setPerson] = useState<Person | null>(null);
    const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
    const projects = useStore((state) => state.projectsStore.projects);

    // A task reassigned to someone else leaves this person's list.
    const handleTaskUpdate = async (updated: Task) => {
        setAssignedTasks((prev) =>
            updated.assigned_to && updated.assigned_to !== uid
                ? prev.filter((task) => task.uid !== updated.uid)
                : prev.map((task) =>
                      task.uid === updated.uid ? updated : task
                  )
        );
    };

    const handleTaskDelete = (taskUid: string) => {
        setAssignedTasks((prev) => prev.filter((task) => task.uid !== taskUid));
    };
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
    const [signInLinkOpen, setSignInLinkOpen] = useState(false);
    const [memberEditOpen, setMemberEditOpen] = useState(false);
    const [memberRemoveOpen, setMemberRemoveOpen] = useState(false);

    const load = async () => {
        if (!uid) return;
        setLoading(true);
        try {
            const p = await fetchPersonByUid(uid);
            setPerson(p);

            const response = await fetch(
                `/api/tasks?assigned_to=${encodeURIComponent(uid)}&status=active`,
                {
                    credentials: 'include',
                    headers: { Accept: 'application/json' },
                }
            );
            if (response.ok) {
                const data = await response.json();
                setAssignedTasks(data.tasks ?? []);
            }
        } catch {
            showErrorToast('Failed to load person');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [uid]);

    const handleSave = async (data: Partial<Person>) => {
        if (!person?.uid) return;
        const result = await updatePerson(person.uid, data);
        setPerson(result.person);
        showSuccessToast('Person updated');
    };

    const handleArchive = async () => {
        if (!person?.uid) return;
        try {
            const result = await updatePerson(person.uid, {
                archived: !person.archived,
            });
            setPerson(result.person);
            showSuccessToast(
                person.archived ? 'Person unarchived' : 'Person archived'
            );
        } catch (err: unknown) {
            showErrorToast(
                err instanceof Error ? err.message : 'Failed to archive'
            );
        }
    };

    const handleDelete = async () => {
        if (!person?.uid) return;
        try {
            await deletePerson(person.uid);
            showSuccessToast('Person deleted');
            navigate('/people');
        } catch (err: unknown) {
            showErrorToast(
                err instanceof Error ? err.message : 'Failed to delete person'
            );
        } finally {
            setIsConfirmDialogOpen(false);
        }
    };

    const handleRemoveMember = async (reassignTo: number | null) => {
        if (person?.linked_user_id == null) return;
        try {
            await removeMember(person.linked_user_id, reassignTo);
            showSuccessToast(t('members.removed', 'Member removed'));
            navigate('/people');
        } catch (err: unknown) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('members.failedToRemove', 'Failed to remove member')
            );
        } finally {
            setMemberRemoveOpen(false);
        }
    };

    // A member you added: you can rename it, give it an email, or remove it.
    const managesMember =
        person?.kind === 'member' &&
        person.can_manage === true &&
        person.can_edit === false;

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center text-surface-on-variant">
                {t('common.loading', 'Loading...')}
            </div>
        );
    }

    if (!person) {
        return <EmptyState title={t('people.notFound', 'Person not found.')} />;
    }

    const canEdit = person.can_edit !== false;
    const canArchive = canEdit && person.kind !== 'member';
    const signInLink: MenuItem | null = person.can_sign_in_link
        ? {
              key: 'sign-in-link',
              label: t('people.signInLink', 'Sign-in link'),
              icon: <LinkIcon />,
              onSelect: () => setSignInLinkOpen(true),
              testId: 'person-sign-in-link',
          }
        : null;
    // One action on the header (Edit, else the sign-in link), the rest in ⋯.
    const menu: MenuEntry[] = [
        ...(canEdit && signInLink ? [signInLink] : []),
        ...(managesMember
            ? [
                  {
                      key: 'member-edit',
                      label: t('members.editTitle', 'Edit member'),
                      icon: <PencilSquareIcon />,
                      onSelect: () => setMemberEditOpen(true),
                      testId: 'member-edit',
                  },
                  {
                      key: 'member-remove',
                      label: t('members.remove', 'Remove member'),
                      icon: <TrashIcon />,
                      danger: true,
                      onSelect: () => setMemberRemoveOpen(true),
                      testId: 'member-remove',
                  },
              ]
            : []),
        ...(canArchive
            ? [
                  {
                      key: 'archive',
                      label: person.archived
                          ? t('people.unarchive', 'Unarchive')
                          : t('people.archive', 'Archive'),
                      icon: <ArchiveBoxIcon />,
                      onSelect: handleArchive,
                      testId: 'person-archive',
                  },
                  'separator' as const,
                  {
                      key: 'delete',
                      label: t('common.delete', 'Delete'),
                      icon: <TrashIcon />,
                      danger: true,
                      onSelect: () => setIsConfirmDialogOpen(true),
                      testId: 'person-delete',
                  },
              ]
            : []),
    ];

    const meta = [
        person.kind === 'member'
            ? memberRoleLabel(person, t)
            : t('people.contact', 'Contact'),
        RELATIONSHIP_LABELS[person.relationship_type ?? 'other'],
        person.linked_user_id != null
            ? t('people.linkedAccount', 'Linked to a user account')
            : null,
        assignedTasks.length > 0
            ? t('counts.tasks', { count: assignedTasks.length })
            : null,
        person.archived ? t('people.archivedBadge', 'archived') : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const contact = (person.email || person.phone || person.notes) && (
        <div className="space-y-1.5">
            {(person.email || person.phone) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-m text-surface-on-variant">
                    {person.email && (
                        <a
                            href={`mailto:${person.email}`}
                            className="inline-flex items-center gap-1.5 hover:text-surface-on hover:underline"
                        >
                            <EnvelopeIcon className="h-4 w-4" />
                            {person.email}
                        </a>
                    )}
                    {person.phone && (
                        <a
                            href={`tel:${person.phone}`}
                            className="inline-flex items-center gap-1.5 hover:text-surface-on hover:underline"
                        >
                            <PhoneIcon className="h-4 w-4" />
                            {person.phone}
                        </a>
                    )}
                </div>
            )}
            {person.notes && (
                <p className="max-w-3xl whitespace-pre-line text-body-m leading-relaxed text-surface-on-variant">
                    {person.notes}
                </p>
            )}
        </div>
    );

    return (
        <PageShell template="board">
            <PersonHero
                name={person.name}
                color={person.color}
                meta={meta}
                description={contact || undefined}
                actions={
                    <>
                        {canEdit ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={<PencilSquareIcon className="h-4 w-4" />}
                                onClick={() => setModalOpen(true)}
                                title={t('people.editPerson', 'Edit person')}
                            >
                                {t('common.edit', 'Edit')}
                            </Button>
                        ) : (
                            signInLink && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={<LinkIcon className="h-4 w-4" />}
                                    onClick={signInLink.onSelect}
                                    data-testid="person-sign-in-link"
                                >
                                    {signInLink.label}
                                </Button>
                            )
                        )}
                        {menu.length > 0 && (
                            <Menu
                                entries={menu}
                                testId="person-actions-menu"
                                trigger={(triggerProps) => (
                                    <IconButton
                                        {...triggerProps}
                                        label={t(
                                            'project.moreOptions',
                                            'More options'
                                        )}
                                    >
                                        <EllipsisHorizontalIcon />
                                    </IconButton>
                                )}
                            />
                        )}
                    </>
                }
            />

            {/* Assigned Tasks */}
            <section className={PAGE_GUTTER}>
                <h2 className="mb-2 text-body font-semibold text-surface-on">
                    {t('tasks.title', 'Tasks')}
                    {assignedTasks.length > 0 && (
                        <span className="ml-2 font-normal tabular-nums text-surface-on-variant">
                            {assignedTasks.length}
                        </span>
                    )}
                </h2>
                {assignedTasks.length === 0 ? (
                    <EmptyState
                        title={t('people.noAssignedTasks', {
                            name: person.name,
                            defaultValue: 'No tasks assigned to {{name}}.',
                        })}
                    />
                ) : (
                    <TaskList
                        tasks={assignedTasks}
                        projects={projects}
                        onTaskUpdate={handleTaskUpdate}
                        onTaskDelete={handleTaskDelete}
                    />
                )}
            </section>

            {person.uid && (
                <Backlinks
                    type="person"
                    uid={person.uid}
                    className={`mt-6 ${PAGE_GUTTER}`}
                />
            )}

            {modalOpen && (
                <PersonModal
                    person={person}
                    onSave={handleSave}
                    onClose={() => setModalOpen(false)}
                />
            )}

            {signInLinkOpen && person.linked_user_id != null && (
                <SignInLinkModal
                    memberId={person.linked_user_id}
                    memberName={person.name}
                    onClose={() => setSignInLinkOpen(false)}
                />
            )}

            {memberEditOpen && (
                <MemberEditModal
                    person={person}
                    onSaved={(member) => {
                        showSuccessToast(
                            member.invited
                                ? t('members.invitationSent', 'Invitation sent')
                                : t('members.updated', 'Member updated')
                        );
                        load();
                    }}
                    onClose={() => setMemberEditOpen(false)}
                />
            )}

            {memberRemoveOpen && person.linked_user_id != null && (
                <MemberRemoveDialog
                    memberId={person.linked_user_id}
                    memberName={person.name}
                    onConfirm={handleRemoveMember}
                    onCancel={() => setMemberRemoveOpen(false)}
                />
            )}

            {isConfirmDialogOpen && (
                <ConfirmDialog
                    title={t('people.deletePerson', 'Delete Person')}
                    message={t('people.deleteConfirm', {
                        name: person.name,
                        defaultValue:
                            'Are you sure you want to delete "{{name}}"? This cannot be undone.',
                    })}
                    onConfirm={handleDelete}
                    onCancel={() => setIsConfirmDialogOpen(false)}
                />
            )}
        </PageShell>
    );
};

export default PersonDetails;

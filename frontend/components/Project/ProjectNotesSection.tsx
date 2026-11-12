import React from 'react';
import { Note } from '../../entities/Note';
import NoteRow from '../Shared/NoteRow';
import Button from '../Shared/ui/Button';
import { TFunction } from 'i18next';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Project } from '../../entities/Project';

interface ProjectNotesSectionProps {
    project: Project;
    notes: Note[];
    t: TFunction;
    onCreateNote: () => void;
    onEditNote: (note: Note) => Promise<void>;
    onDeleteNote: (note: Note) => void;
}

const ProjectNotesSection: React.FC<ProjectNotesSectionProps> = ({
    project,
    notes,
    t,
    onCreateNote,
    onEditNote,
    onDeleteNote,
}) => {
    return (
        <div>
            <div className="mb-2">
                <Button
                    icon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => {
                        if (!project?.id || !project.name) return;
                        onCreateNote();
                    }}
                >
                    {t('noteCreation', 'Create New Note')}
                </Button>
            </div>

            {notes.length > 0 ? (
                <div role="list" className="-mx-3">
                    {notes.map((note) => (
                        <NoteRow
                            key={note.uid}
                            note={{
                                ...note,
                                project: undefined,
                                Project: undefined,
                            }}
                            menu={[
                                {
                                    key: 'edit',
                                    label: t('common.edit', 'Edit'),
                                    onSelect: () => void onEditNote(note),
                                },
                                {
                                    key: 'delete',
                                    label: t('common.delete', 'Delete'),
                                    danger: true,
                                    testId: `note-delete-${note.uid}`,
                                    onSelect: () => onDeleteNote(note),
                                },
                            ]}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-body-m text-surface-on-variant">
                    {t('project.noNotes', 'No notes for this project.')}
                </p>
            )}
        </div>
    );
};

export default ProjectNotesSection;

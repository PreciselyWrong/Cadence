import React from 'react';
import { useTranslation } from 'react-i18next';
import { Note } from '../../entities/Note';
import { firstImageIn, plainExcerpt } from '../../utils/galleryPreview';
import GalleryCard from '../Shared/GalleryCard';

interface NoteGalleryProps {
    notes: Note[];
}

// The notes as picture cards: the note's own first image, else the start of
// its text.
const NoteGallery: React.FC<NoteGalleryProps> = ({ notes }) => {
    const { t } = useTranslation();

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {notes.map((note) => {
                const image = firstImageIn(note.content) ?? null;
                return (
                    <GalleryCard
                        key={note.uid ?? note.id}
                        title={
                            note.title || t('notes.untitled', 'Untitled Note')
                        }
                        image={image}
                        excerpt={image ? null : plainExcerpt(note.content)}
                        tags={note.tags || note.Tags || []}
                        to={`/notes/${note.uid}`}
                    />
                );
            })}
        </div>
    );
};

export default NoteGallery;

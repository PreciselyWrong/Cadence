import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Note } from '../../entities/Note';
import { useLinksStore } from '../../store/linksStore';
import { firstImageIn, plainExcerpt } from '../../utils/galleryPreview';
import GalleryCard from '../Shared/GalleryCard';

interface NoteGalleryProps {
    notes: Note[];
}

// The notes as picture cards: the note's own first image, else the preview
// of a link found in it, else the start of its text.
const NoteGallery: React.FC<NoteGalleryProps> = ({ notes }) => {
    const { t } = useTranslation();
    const links = useLinksStore((s) => s.links);
    const loadLinks = useLinksStore((s) => s.load);

    useEffect(() => {
        void loadLinks();
    }, [loadLinks]);

    const linkImageByNote = useMemo(() => {
        const images = new Map<string, string>();
        for (const link of links) {
            if (
                link.source_type === 'note' &&
                link.source_uid &&
                link.image_url &&
                !images.has(link.source_uid)
            ) {
                images.set(link.source_uid, link.image_url);
            }
        }
        return images;
    }, [links]);

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {notes.map((note) => {
                const image =
                    firstImageIn(note.content) ??
                    (note.uid ? linkImageByNote.get(note.uid) : undefined) ??
                    null;
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

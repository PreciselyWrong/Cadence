import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BookmarksImportDialog from '../BookmarksImportDialog';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, string | number>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const mockAddPages = jest.fn();
const mockCreateProject = jest.fn();
jest.mock('../../../utils/projectPagesService', () => ({
    addProjectPages: (uid: string, pages: unknown) => mockAddPages(uid, pages),
}));
jest.mock('../../../utils/projectsService', () => ({
    ...jest.requireActual('../../../utils/projectsService'),
    createProject: (p: unknown) => mockCreateProject(p),
}));

const EXPORT = `<DL><p>
  <DT><H3>Outils</H3>
  <DL><p>
    <DT><A HREF="https://a.example/1">Un</A>
    <DT><A HREF="https://a.example/2">Deux</A>
  </DL><p>
  <DT><H3>Lecture</H3>
  <DL><p><DT><A HREF="https://b.example/x">X</A></DL><p>
</DL>`;

const upload = () => {
    const file = new File([EXPORT], 'bookmarks.html', { type: 'text/html' });
    // jsdom's File has no text().
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(EXPORT) });
    fireEvent.change(screen.getByLabelText('Bookmarks file'), {
        target: { files: [file] },
    });
};

// A bookmarks folder becomes the pages of a project (docs/37-links.md).
describe('BookmarksImportDialog', () => {
    beforeEach(() => {
        mockAddPages.mockReset().mockResolvedValue({
            created: 2,
            existing: 0,
            invalid: 0,
        });
        mockCreateProject.mockReset().mockResolvedValue({ uid: 'new1' });
    });

    it('sends a folder to a new project named like it', async () => {
        const onDone = jest.fn();
        render(
            <BookmarksImportDialog
                projects={[]}
                onClose={jest.fn()}
                onDone={onDone}
            />
        );
        upload();
        fireEvent.click(await screen.findByLabelText('Outils (2)'));
        fireEvent.click(screen.getByRole('button', { name: 'Import' }));
        await waitFor(() =>
            expect(mockCreateProject).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Outils' })
            )
        );
        expect(mockAddPages).toHaveBeenCalledWith('new1', [
            { url: 'https://a.example/1', title: 'Un' },
            { url: 'https://a.example/2', title: 'Deux' },
        ]);
        await waitFor(() => expect(onDone).toHaveBeenCalledWith('new1'));
    });

    it('sends a folder to a chosen project', async () => {
        render(
            <BookmarksImportDialog
                projects={[{ uid: 'p1', name: 'Recherche' } as any]}
                onClose={jest.fn()}
                onDone={jest.fn()}
            />
        );
        upload();
        fireEvent.click(await screen.findByLabelText('Lecture (1)'));
        fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), {
            target: { value: 'p1' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Import' }));
        await waitFor(() =>
            expect(mockAddPages).toHaveBeenCalledWith('p1', [
                { url: 'https://b.example/x', title: 'X' },
            ])
        );
        expect(mockCreateProject).not.toHaveBeenCalled();
    });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import LinkCard from '../LinkCard';
import { Link } from '../../../entities/Link';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback?: string,
            options?: Record<string, unknown>
        ) =>
            (fallback ?? _key).replace(
                /\{\{(\w+)\}\}/g,
                (_match, name: string) =>
                    String(options?.[name] ?? `{{${name}}}`)
            ),
        i18n: { language: 'en' },
    }),
}));

const link: Link = {
    uid: 'l1',
    url: 'https://github.com/owner/tool',
    domain: 'github.com',
    title: 'owner/tool',
    description: 'A fast JSON CLI',
    image_url: null,
    site_name: 'GitHub',
    kind: 'repo',
    github_stars: 1234,
    github_language: 'Rust',
    github_last_commit: '2026-10-01T00:00:00.000Z',
    readme_excerpt: 'Tool reads JSON and prints tables.',
    note: null,
    status: 'new',
    review_at: null,
    project_uid: null,
    project_name: null,
    tags: [{ uid: 't', name: 'dev', color: null }],
    source_type: 'task',
    source_uid: 'task1',
    fetch_status: 'done',
    fetched_at: null,
    created_at: '2026-10-02T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
};

const renderCard = (overrides: Partial<Link> = {}) => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    render(
        <MemoryRouter>
            <LinkCard
                link={{ ...link, ...overrides }}
                onChange={onChange}
                onDelete={jest.fn()}
                availableTags={[]}
            />
        </MemoryRouter>
    );
    return onChange;
};

describe('LinkCard', () => {
    it('says what the link is: title, description, site, stats, tags', () => {
        renderCard();

        expect(screen.getByText('owner/tool')).toBeInTheDocument();
        expect(screen.getByText('A fast JSON CLI')).toBeInTheDocument();
        expect(screen.getByText('github.com')).toBeInTheDocument();
        expect(screen.getByText('Rust')).toBeInTheDocument();
        expect(screen.getByText('1.2K')).toBeInTheDocument();
        expect(screen.getByText('#dev')).toBeInTheDocument();
        // No kind badge, no README start: one line says what the page is.
        expect(screen.queryByText('Repo')).toBeNull();
        expect(
            screen.queryByText('Tool reads JSON and prints tables.')
        ).toBeNull();
    });

    it('writes a note from the menu and saves it on Enter', async () => {
        const onChange = renderCard();
        // No empty "Add a note" line on every row: it is in the menu.
        expect(screen.queryByText('Add a note')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Add a note' }));
        const field = screen.getByLabelText('Your note');
        fireEvent.change(field, { target: { value: '  for invoices ' } });
        fireEvent.keyDown(field, { key: 'Enter' });

        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({ note: 'for invoices' })
        );
    });

    it('archives from the menu, with no status select', () => {
        const onChange = renderCard();
        expect(screen.queryByRole('combobox')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
        expect(onChange).toHaveBeenCalledWith({ status: 'dropped' });
    });

    it('unarchives an archived link', () => {
        const onChange = renderCard({ status: 'dropped' });
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Unarchive' }));
        expect(onChange).toHaveBeenCalledWith({ status: 'new' });
    });

    it('offers no row of status buttons', () => {
        renderCard();
        for (const name of ['Keep', 'Later', 'Archive', 'Attach', 'Task']) {
            expect(screen.queryByRole('button', { name })).toBeNull();
        }
    });

    it('opens the link in a new tab and offers the source', () => {
        renderCard();
        expect(
            screen.getByRole('link', { name: 'Open the link' })
        ).toHaveAttribute('href', 'https://github.com/owner/tool');
        expect(
            screen.getByRole('button', { name: 'Go to where it was saved' })
        ).toBeInTheDocument();
    });

    it('says when a link comes back for review', () => {
        renderCard({ review_at: '2026-12-01' });

        expect(screen.getByText('Review on Dec 1')).toBeInTheDocument();
    });

    it('shows no review day without one', () => {
        renderCard();

        expect(screen.queryByText(/Review on/)).not.toBeInTheDocument();
    });

    const openMenuItem = (name: string) => {
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name }));
    };

    const renderWithActions = () => {
        const onChange = jest.fn().mockResolvedValue(undefined);
        const onDelete = jest.fn().mockResolvedValue(undefined);
        render(
            <MemoryRouter>
                <LinkCard
                    link={link}
                    onChange={onChange}
                    onDelete={onDelete}
                    availableTags={[]}
                    projects={[{ uid: 'p1', name: 'Tooling' } as never]}
                />
            </MemoryRouter>
        );
        return { onChange, onDelete };
    };

    it('edits the title, address and project, sending only what changed', async () => {
        const { onChange } = renderWithActions();
        openMenuItem('Edit');
        fireEvent.change(screen.getByLabelText('Title'), {
            target: { value: 'My tool' },
        });
        fireEvent.change(screen.getByLabelText('Address'), {
            target: { value: 'https://example.com/tool' },
        });
        fireEvent.change(screen.getByLabelText('Project'), {
            target: { value: 'p1' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({
                title: 'My tool',
                url: 'https://example.com/tool',
                project_uid: 'p1',
            })
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        );
    });

    it('keeps the form open when the server refuses', async () => {
        const { onChange } = renderWithActions();
        onChange.mockRejectedValueOnce(new Error('taken'));
        openMenuItem('Edit');
        fireEvent.change(screen.getByLabelText('Title'), {
            target: { value: 'My tool' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
        );
        expect(screen.getByLabelText('Title')).toHaveValue('My tool');
    });

    it('deletes only after confirming', () => {
        const { onDelete } = renderWithActions();
        openMenuItem('Delete');
        expect(onDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('names the project of the link', () => {
        renderCard({ project_uid: 'p1', project_name: 'Tooling' });
        expect(screen.getByText('Tooling')).toBeInTheDocument();
    });
});

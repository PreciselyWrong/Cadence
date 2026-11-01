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
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
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
                availableTags={[]}
            />
        </MemoryRouter>
    );
    return onChange;
};

describe('LinkCard', () => {
    it('says what the link is: title, description, kind, stats, README, tags', () => {
        renderCard();

        expect(screen.getByText('owner/tool')).toBeInTheDocument();
        expect(screen.getByText('A fast JSON CLI')).toBeInTheDocument();
        expect(screen.getByText('github.com')).toBeInTheDocument();
        expect(screen.getByText('Repo')).toBeInTheDocument();
        expect(screen.getByText('Rust')).toBeInTheDocument();
        expect(screen.getByText('1.2K')).toBeInTheDocument();
        expect(
            screen.getByText('Tool reads JSON and prints tables.')
        ).toBeInTheDocument();
        expect(screen.getByText('#dev')).toBeInTheDocument();
    });

    it('writes a note and saves it on Enter', async () => {
        const onChange = renderCard();

        fireEvent.click(screen.getByText('Add a note'));
        const field = screen.getByLabelText('Your note');
        fireEvent.change(field, { target: { value: '  for invoices ' } });
        fireEvent.keyDown(field, { key: 'Enter' });

        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({ note: 'for invoices' })
        );
    });

    it('sets a status', () => {
        const onChange = renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
        expect(onChange).toHaveBeenCalledWith({ status: 'kept' });
    });

    it('unsets the active status', () => {
        const onChange = renderCard({ status: 'parked' });
        const later = screen.getByRole('button', { name: 'Later' });
        expect(later).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(later);
        expect(onChange).toHaveBeenCalledWith({ status: 'new' });
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

    it('says when a parked link comes back for review', () => {
        renderCard({ status: 'parked', review_at: '2026-12-01' });

        expect(screen.getByText('Review on Dec 1')).toBeInTheDocument();
    });

    it('shows no review day for a link that is not parked', () => {
        renderCard({ status: 'kept', review_at: '2026-12-01' });

        expect(screen.queryByText(/Review on/)).not.toBeInTheDocument();
    });
});

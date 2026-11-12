import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import InboxColumn from '../InboxColumn';
import { InboxItem } from '../../../entities/InboxItem';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

const item = (fields: Partial<InboxItem>): InboxItem =>
    ({
        uid: 'u1',
        content: 'Buy milk',
        status: 'added',
        ...fields,
    }) as InboxItem;

const LocationProbe = () => {
    const location = useLocation();
    return <p data-testid="location">{location.pathname}</p>;
};

const renderColumn = (items: InboxItem[], loading = false) =>
    render(
        <MemoryRouter initialEntries={['/upcoming']}>
            <Routes>
                <Route
                    path="/upcoming"
                    element={<InboxColumn items={items} loading={loading} />}
                />
                <Route path="/inbox" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>
    );

describe('InboxColumn', () => {
    it('shows each open item as a card with its title', () => {
        renderColumn([
            item({ uid: 'a', title: 'Call the plumber', content: 'long text' }),
            item({ uid: 'b', title: null, content: 'Renew passport' }),
        ]);

        const cards = screen.getAllByTestId('inbox-card');
        expect(cards).toHaveLength(2);
        expect(cards[0]).toHaveTextContent('Call the plumber');
        expect(cards[1]).toHaveTextContent('Renew passport');
    });

    it('shows the source of an item under its title', () => {
        renderColumn([
            item({ uid: 'a', content: 'From chat', source: 'telegram' }),
        ]);

        expect(screen.getByText('telegram')).toBeInTheDocument();
    });

    it('hides items that are processed, deleted or trashed', () => {
        renderColumn([
            item({ uid: 'open', content: 'Still waiting', status: 'added' }),
            item({ uid: 'done', content: 'Handled', status: 'processed' }),
            item({ uid: 'gone', content: 'Deleted', status: 'deleted' }),
            item({ uid: 'bin', content: 'Trashed', status: 'trashed' }),
        ]);

        expect(screen.getAllByTestId('inbox-card')).toHaveLength(1);
        expect(screen.getByText('Still waiting')).toBeInTheDocument();
        expect(screen.queryByText('Handled')).not.toBeInTheDocument();
        expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
        expect(screen.queryByText('Trashed')).not.toBeInTheDocument();
    });

    it('shows the empty state when there is nothing waiting', () => {
        renderColumn([]);

        expect(screen.getByText('Inbox is empty.')).toBeInTheDocument();
        expect(screen.queryByTestId('inbox-card')).not.toBeInTheDocument();
    });

    it('treats only-processed items as empty', () => {
        renderColumn([item({ uid: 'a', status: 'processed' })]);

        expect(screen.getByText('Inbox is empty.')).toBeInTheDocument();
    });

    it('hides the empty state while the inbox is loading', () => {
        renderColumn([], true);

        expect(screen.queryByText('Inbox is empty.')).not.toBeInTheDocument();
    });

    it('marks each card as a task row so a click on it is not an outside click', () => {
        renderColumn([item({ uid: 'a', content: 'Row' })]);

        expect(screen.getByTestId('inbox-card')).toHaveAttribute(
            'data-task-row'
        );
    });

    it('opens the inbox page when a card is clicked', () => {
        renderColumn([item({ uid: 'a', content: 'Open me' })]);

        fireEvent.click(screen.getByTestId('inbox-card'));

        expect(screen.getByTestId('location')).toHaveTextContent('/inbox');
    });
});

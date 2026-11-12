import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import InboxColumn, {
    inboxCollapsed,
    loadInboxCollapsed,
    saveInboxCollapsed,
} from '../InboxColumn';
import { InboxItem } from '../../../entities/InboxItem';
import { createInboxItemWithStore } from '../../../utils/inboxService';

jest.mock('../../../utils/inboxService', () => ({
    createInboxItemWithStore: jest.fn(),
}));

const createMock = createInboxItemWithStore as jest.MockedFunction<
    typeof createInboxItemWithStore
>;

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

describe('InboxColumn adding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        createMock.mockResolvedValue(item({ uid: 'new' }));
    });

    it('shows the + button when the inbox is empty', () => {
        renderColumn([]);

        expect(
            screen.getByRole('button', { name: 'Add to inbox' })
        ).toBeInTheDocument();
    });

    it('shows the + button on the collapsed bar and expands the column from it', () => {
        const onChange = jest.fn();
        render(
            <MemoryRouter>
                <InboxColumn
                    items={[]}
                    loading={false}
                    collapsed
                    onCollapsedChange={onChange}
                />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));

        expect(onChange).toHaveBeenCalledWith(false);
    });

    it('adds the typed text through the inbox service on Enter', async () => {
        renderColumn([]);

        fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));
        const input = screen.getByRole('textbox', { name: 'New inbox item' });
        expect(input).toHaveFocus();
        fireEvent.change(input, { target: { value: '  Pick up parcel  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(createMock).toHaveBeenCalledWith('Pick up parcel');
        await waitFor(() => expect(input).toHaveValue(''));
    });

    it('closes on Escape without adding', () => {
        renderColumn([]);

        fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));
        const input = screen.getByRole('textbox', { name: 'New inbox item' });
        fireEvent.change(input, { target: { value: 'Half typed' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(
            screen.queryByRole('textbox', { name: 'New inbox item' })
        ).not.toBeInTheDocument();
        expect(createMock).not.toHaveBeenCalled();
    });

    it('closes when left empty', () => {
        renderColumn([]);

        fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));
        fireEvent.blur(screen.getByRole('textbox', { name: 'New inbox item' }));

        expect(
            screen.queryByRole('textbox', { name: 'New inbox item' })
        ).not.toBeInTheDocument();
    });

    it('keeps the text and shows an error when adding fails', async () => {
        createMock.mockRejectedValueOnce(new Error('offline'));
        renderColumn([]);

        fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));
        const input = screen.getByRole('textbox', { name: 'New inbox item' });
        fireEvent.change(input, { target: { value: 'Keep me' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not add it. Try again.'
        );
        expect(input).toHaveValue('Keep me');
    });
});

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

describe('InboxColumn collapsed', () => {
    beforeEach(() => localStorage.clear());

    it('is collapsed when empty, whatever was chosen', () => {
        expect(inboxCollapsed(0, null)).toBe(true);
        expect(inboxCollapsed(0, false)).toBe(true);
        expect(inboxCollapsed(3, null)).toBe(false);
        expect(inboxCollapsed(3, true)).toBe(true);
    });

    it('remembers the viewer choice', () => {
        expect(loadInboxCollapsed()).toBeNull();
        saveInboxCollapsed(true);
        expect(loadInboxCollapsed()).toBe(true);
        saveInboxCollapsed(false);
        expect(loadInboxCollapsed()).toBe(false);
    });

    it('shows a bar with the count that expands the column', () => {
        const onChange = jest.fn();
        render(
            <MemoryRouter>
                <InboxColumn
                    items={[item({ uid: 'a' }), item({ uid: 'b' })]}
                    loading={false}
                    collapsed
                    onCollapsedChange={onChange}
                />
            </MemoryRouter>
        );
        expect(screen.queryByTestId('inbox-card')).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Show the inbox (2)' })
        );
        expect(onChange).toHaveBeenCalledWith(false);
    });

    it('collapses from its header', () => {
        const onChange = jest.fn();
        render(
            <MemoryRouter>
                <InboxColumn
                    items={[item({ uid: 'a' })]}
                    loading={false}
                    onCollapsedChange={onChange}
                />
            </MemoryRouter>
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Collapse the inbox' })
        );
        expect(onChange).toHaveBeenCalledWith(true);
    });
});

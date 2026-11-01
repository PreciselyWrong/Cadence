import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InboxItems from '../InboxItems';
import { useStore } from '../../../store/useStore';

// Stable references: the page reloads its data when `t` or the toast
// helpers change identity.
const mockT = (key: string, fallback?: any, options?: any) =>
    typeof fallback === 'string'
        ? fallback.replace(
              /\{\{(\w+)\}\}/g,
              (_: string, name: string) => options?.[name] ?? ''
          )
        : key;
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: mockT }),
}));

jest.mock('../../Project/ProjectModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../Note/NoteModal', () => ({
    __esModule: true,
    default: () => null,
}));

const mockSearch = [new URLSearchParams(), jest.fn()];
jest.mock('react-router-dom', () => ({
    useSearchParams: () => mockSearch,
}));

const mockToast = { showSuccessToast: jest.fn(), showErrorToast: jest.fn() };
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => mockToast,
}));

jest.mock('../../../utils/inboxService', () => ({
    loadInboxItemsToStore: jest.fn(),
    loadMoreInboxItemsToStore: jest.fn(),
    processInboxItemWithStore: jest.fn(),
    deleteInboxItemWithStore: jest.fn(),
    updateInboxItemWithStore: jest.fn(),
}));
jest.mock('../../../utils/projectsService', () => ({
    fetchProjects: jest.fn().mockResolvedValue([]),
    createProject: jest.fn(),
}));
jest.mock('../../../utils/areasService', () => ({
    fetchAreas: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../utils/profileService', () => ({
    getInboxRecentlyCapturedExpanded: jest.fn().mockResolvedValue(true),
    updateUiSettings: jest.fn(),
}));
jest.mock('../../../store/linksStore', () => ({
    useLinksRefresh: jest.fn(),
    useLinksStore: (pick: (state: unknown) => unknown) => pick({ links: [] }),
}));
jest.mock('../../../utils/shareTargetService', () => ({
    takeSharedText: () => '',
}));

function mockStub(testId: string) {
    const Stub = () => <div data-testid={testId} />;
    return Stub;
}
jest.mock('../QuickCaptureInput', () => ({
    __esModule: true,
    default: mockStub('capture'),
}));
jest.mock('../InboxTriage', () => ({
    __esModule: true,
    default: mockStub('triage'),
}));
jest.mock('../InboxItemDetail', () => ({
    __esModule: true,
    default: ({ item }: { item: { content: string } }) => (
        <div data-testid="inbox-item">{item.content}</div>
    ),
}));

const items = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        uid: `item-${i + 1}`,
        content: `Idea ${i + 1}`,
        status: 'added',
        created_at: '2026-11-01T10:00:00Z',
    }));

const setInbox = (count: number, total: number) =>
    act(() => {
        useStore.setState((state: any) => ({
            inboxStore: {
                ...state.inboxStore,
                inboxItems: items(count),
                isLoading: false,
                pagination: {
                    total,
                    limit: 20,
                    offset: 0,
                    hasMore: count < total,
                },
            },
            tagsStore: {
                ...state.tagsStore,
                hasLoaded: true,
                isLoading: false,
            },
        }));
    });

describe('InboxItems count footer', () => {
    it('says nothing more when every item is already shown', async () => {
        setInbox(3, 3);
        render(<InboxItems />);

        expect(await screen.findAllByTestId('inbox-item')).toHaveLength(3);
        expect(screen.queryByTestId('inbox-showing-count')).toBeNull();
        expect(screen.queryByText(/Showing 3 of 3/)).toBeNull();
    });

    it('tells how many are shown while more can be loaded', async () => {
        setInbox(20, 45);
        render(<InboxItems />);

        expect(
            await screen.findByTestId('inbox-showing-count')
        ).toHaveTextContent('Showing 20 of 45 items');
    });
});

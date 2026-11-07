import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import LinksPage from '../LinksPage';
import { Link } from '../../../entities/Link';
import { useViewType } from '../../../hooks/useViewType';
import { createTask } from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            String(fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) =>
                String(options?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(),
}));

jest.mock('../../../hooks/useViewType', () => ({
    useViewType: jest.fn(),
}));

const link = (uid: string, extra: Partial<Link> = {}): Link => ({
    uid,
    url: `https://${uid}.example.com/page`,
    domain: `${uid}.example.com`,
    title: `Title ${uid}`,
    description: 'About it',
    image_url: null,
    site_name: null,
    kind: 'article',
    github_stars: null,
    github_language: null,
    github_last_commit: null,
    readme_excerpt: null,
    note: null,
    status: 'new',
    review_at: null,
    project_uid: null,
    project_name: null,
    tags: [],
    source_type: 'note',
    source_uid: 'n1',
    fetch_status: 'done',
    fetched_at: null,
    created_at: '2026-10-02T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    ...extra,
});

const links = [
    link('one', {
        image_url: 'https://img.example.com/one.png',
        tags: [{ uid: 'tg', name: 'reading', color: null }],
    }),
    link('two', { title: null, note: 'Read before the trip' }),
    link('old', { status: 'dropped', title: 'Title old' }),
];

const mockSave = jest.fn();

jest.mock('../../../store/linksStore', () => ({
    useLinksRefresh: jest.fn(),
    useLinksStore: (selector: (s: unknown) => unknown) =>
        selector({
            links,
            loaded: true,
            error: false,
            save: mockSave,
        }),
}));

jest.mock('../../../store/useStore', () => {
    const state = {
        tagsStore: { hasLoaded: true, tags: [], loadTags: jest.fn() },
        projectsStore: {
            hasLoaded: true,
            isLoading: false,
            projects: [],
            loadProjects: jest.fn(),
        },
    };
    return {
        useStore: (selector?: (s: unknown) => unknown) =>
            selector ? selector(state) : state,
    };
});

const mockViewType = useViewType as jest.Mock;

const renderPage = () =>
    render(
        <MemoryRouter>
            <LinksPage />
        </MemoryRouter>
    );

describe('LinksPage gallery', () => {
    beforeEach(() => localStorage.clear());

    it('switches from the list to the gallery and remembers it', () => {
        const setViewType = jest.fn();
        mockViewType.mockReturnValue({
            viewType: 'list',
            setViewType,
            loaded: true,
        });

        renderPage();

        expect(mockViewType).toHaveBeenCalledWith('links', 'list');
        expect(screen.getAllByTestId('link-card')).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));
        expect(setViewType).toHaveBeenCalledWith('gallery');
    });

    it('shows each link as a picture card with its title, site and tags', () => {
        mockViewType.mockReturnValue({
            viewType: 'gallery',
            setViewType: jest.fn(),
            loaded: true,
        });

        renderPage();

        const cards = screen.getAllByTestId('gallery-card');
        expect(cards).toHaveLength(2);
        expect(screen.queryByTestId('link-card')).toBeNull();
        expect(screen.getByTestId('gallery-card-image')).toHaveAttribute(
            'src',
            'https://img.example.com/one.png'
        );
        expect(screen.getByText('Title one')).toBeInTheDocument();
        expect(screen.queryByText('Title old')).toBeNull();
        expect(cards[0]).toHaveTextContent('reading');
        expect(cards[1]).toHaveTextContent('two.example.com');
        expect(cards[0].querySelector('a')).toHaveAttribute(
            'href',
            'https://one.example.com/page'
        );
    });
});

describe('LinksPage list', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        mockViewType.mockReturnValue({
            viewType: 'list',
            setViewType: jest.fn(),
            loaded: true,
        });
    });

    it('filters by search, tag and the archive only', () => {
        renderPage();

        expect(screen.getByRole('searchbox')).toBeInTheDocument();
        expect(
            screen.getByRole('combobox', { name: 'Tag' })
        ).toBeInTheDocument();
        for (const name of ['Kind', 'Status', 'Site', 'Sort']) {
            expect(screen.queryByRole('combobox', { name })).toBeNull();
        }
        expect(screen.queryByText('Title old')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

        expect(screen.getAllByTestId('link-card')).toHaveLength(1);
        expect(screen.getByText('Title old')).toBeInTheDocument();
    });

    it('ignores an older saved filter it no longer has', () => {
        localStorage.setItem(
            'links.filter',
            JSON.stringify({ kind: 'repo', status: 'kept', domain: 'x.io' })
        );

        renderPage();

        expect(screen.getAllByTestId('link-card')).toHaveLength(2);
    });

    it('makes a task named after the link, keeping the link as it is', async () => {
        (createTask as jest.Mock).mockResolvedValue({ name: 'x' });
        renderPage();

        const card = screen.getAllByTestId('link-card')[1];
        fireEvent.click(
            within(card).getByRole('button', { name: 'More actions' })
        );
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Create a task' })
        );

        await waitFor(() =>
            expect(createTask).toHaveBeenCalledWith({
                name: 'Read before the trip',
                note: 'https://two.example.com/page',
            })
        );
        expect(mockSave).not.toHaveBeenCalled();
    });
});

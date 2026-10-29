import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import TagModal from '../TagModal';
import Tags from '../../Tags';
import SidebarTags from '../../Sidebar/SidebarTags';
import { Tag } from '../../../entities/Tag';
import { buildTagTree } from '../../../utils/tagTree';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/tagsService', () => ({
    createTag: jest.fn(),
    updateTag: jest.fn(),
    deleteTag: jest.fn(),
}));

let mockTags: Tag[] = [];
jest.mock('../../../store/useStore', () => {
    const state = () => ({
        tagsStore: {
            tags: mockTags,
            setTags: jest.fn(),
            isLoading: false,
            isError: false,
            hasLoaded: true,
            loadTags: jest.fn(),
        },
    });
    return {
        useStore: (selector?: (s: any) => unknown) =>
            selector ? selector(state()) : state(),
    };
});

const work: Tag = { uid: 'work1', name: 'work', parent_uid: null };
const calls: Tag = { uid: 'calls1', name: 'calls', parent_uid: 'work1' };
const home: Tag = { uid: 'home1', name: 'home', parent_uid: null };

describe('buildTagTree', () => {
    it('nests children under their parent and keeps orphans at the top', () => {
        const orphan: Tag = { uid: 'o1', name: 'orphan', parent_uid: 'gone' };
        const tree = buildTagTree([calls, work, home, orphan]);
        expect(tree.map((n) => n.tag.name)).toEqual(['home', 'orphan', 'work']);
        expect(tree[2].children.map((c) => c.name)).toEqual(['calls']);
    });
});

describe('TagModal parent select', () => {
    beforeEach(() => {
        mockTags = [work, calls, home];
    });

    it('offers only top-level tags other than itself and saves parent_uid', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(
            <TagModal
                isOpen
                onClose={jest.fn()}
                onSave={onSave}
                tag={{ uid: 'new1', name: 'new', parent_uid: null }}
            />
        );

        const select = screen.getByTestId(
            'tag-parent-select'
        ) as HTMLSelectElement;
        const options = Array.from(select.options).map((o) => o.textContent);
        expect(options).toEqual(['None (top level)', 'home', 'work']);

        fireEvent.change(select, { target: { value: 'work1' } });
        fireEvent.click(screen.getByTestId('tag-save-button'));

        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({ parent_uid: 'work1' })
            )
        );
    });

    it('disables the select for a tag that has children', () => {
        render(
            <TagModal
                isOpen
                onClose={jest.fn()}
                onSave={jest.fn()}
                tag={work}
            />
        );
        expect(screen.getByTestId('tag-parent-select')).toBeDisabled();
        expect(
            screen.getByText(
                'This tag has child tags, so it cannot go under another tag.'
            )
        ).toBeInTheDocument();
    });
});

describe('Tags page grouping', () => {
    beforeEach(() => {
        mockTags = [work, calls, home];
    });

    it('shows children under their parent and collapses them', () => {
        render(
            <MemoryRouter>
                <Tags />
            </MemoryRouter>
        );

        const children = screen.getByTestId('tag-children-work1');
        expect(children).toHaveTextContent('calls');

        fireEvent.click(screen.getByTestId('tag-toggle-work1'));
        expect(
            screen.queryByTestId('tag-children-work1')
        ).not.toBeInTheDocument();
        expect(screen.queryByText('calls')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('tag-toggle-work1'));
        expect(screen.getByText('calls')).toBeInTheDocument();
    });
});

describe('SidebarTags nesting', () => {
    beforeEach(() => {
        mockTags = [calls, home, work];
        localStorage.setItem('sidebarSectionExpanded:tags', 'true');
    });

    afterEach(() => localStorage.clear());

    it('lists children right after their parent, indented', () => {
        render(
            <SidebarTags
                handleNavClick={jest.fn()}
                location={
                    {
                        pathname: '/today',
                        search: '',
                        hash: '',
                        state: null,
                        key: 'k',
                    } as any
                }
                isDarkMode={false}
                openTagModal={jest.fn()}
                tags={[]}
            />
        );

        const items = screen.getAllByTestId(/^sidebar-tag-/);
        expect(items.map((el) => el.textContent)).toEqual([
            'home',
            'work',
            'calls',
        ]);
        expect(screen.getByTestId('sidebar-tag-calls1').className).toContain(
            'pl-[44px]'
        );
    });
});

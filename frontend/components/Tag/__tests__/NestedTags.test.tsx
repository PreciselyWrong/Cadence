import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import TagModal from '../TagModal';
import Tags from '../../Tags';
import SidebarTags from '../../Sidebar/SidebarTags';
import { Tag } from '../../../entities/Tag';
import {
    buildTagTree,
    flattenTagTree,
    tagLeafName,
} from '../../../utils/tagTree';

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
        userSettingsStore: { uiDensity: 'dense' },
    });
    return {
        useStore: (selector?: (s: any) => unknown) =>
            selector ? selector(state()) : state(),
    };
});

// Tags are namespaces: the name is the full path, the API keeps parent_uid
// in step with it.
const work: Tag = { uid: 'work1', name: 'work', parent_uid: null };
const calls: Tag = { uid: 'calls1', name: 'work/calls', parent_uid: 'work1' };
const urgent: Tag = {
    uid: 'urgent1',
    name: 'work/calls/urgent',
    parent_uid: 'calls1',
};
const home: Tag = { uid: 'home1', name: 'home', parent_uid: null };

describe('tagLeafName', () => {
    it('keeps the last segment of a namespace', () => {
        expect(tagLeafName('work/calls/urgent')).toBe('urgent');
        expect(tagLeafName('home')).toBe('home');
    });
});

describe('buildTagTree', () => {
    it('nests tags by namespace at any depth', () => {
        const tree = buildTagTree([urgent, calls, work, home]);
        expect(tree.map((n) => n.tag.name)).toEqual(['home', 'work']);
        expect(tree[1].children.map((c) => c.tag.name)).toEqual([
            'work/calls',
        ]);
        expect(tree[1].children[0].children.map((c) => c.tag.name)).toEqual(
            ['work/calls/urgent']
        );
    });

    it('hangs a tag on its nearest listed ancestor', () => {
        const tree = buildTagTree([urgent, work]);
        expect(tree.map((n) => n.tag.name)).toEqual(['work']);
        expect(tree[0].children.map((c) => c.tag.name)).toEqual([
            'work/calls/urgent',
        ]);
    });

    it('flattens with depth, skipping collapsed subtrees', () => {
        const tree = buildTagTree([urgent, calls, work, home]);
        expect(
            flattenTagTree(tree).map(({ tag, depth }) => [tag.name, depth])
        ).toEqual([
            ['home', 0],
            ['work', 0],
            ['work/calls', 1],
            ['work/calls/urgent', 2],
        ]);
        expect(
            flattenTagTree(tree, new Set(['calls1'])).map(({ tag }) => tag.name)
        ).toEqual(['home', 'work', 'work/calls']);
    });
});

describe('TagModal parent select', () => {
    beforeEach(() => {
        mockTags = [work, calls, urgent, home];
    });

    it('offers every tag except itself and its descendants, by full path', () => {
        render(
            <TagModal
                isOpen
                onClose={jest.fn()}
                onSave={jest.fn()}
                tag={calls}
            />
        );

        const select = screen.getByTestId(
            'tag-parent-select'
        ) as HTMLSelectElement;
        expect(select).not.toBeDisabled();
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
            'None (top level)',
            'home',
            'work',
        ]);
        expect(select.value).toBe('work1');
        expect(
            (screen.getByTestId('tag-name-input') as HTMLInputElement).value
        ).toBe('calls');
    });

    it('saves the full path built from the parent and the short name', async () => {
        const onSave = jest.fn().mockResolvedValue(undefined);
        render(
            <TagModal
                isOpen
                onClose={jest.fn()}
                onSave={onSave}
                tag={calls}
            />
        );

        fireEvent.change(screen.getByTestId('tag-parent-select'), {
            target: { value: 'home1' },
        });
        fireEvent.click(screen.getByTestId('tag-save-button'));

        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({ uid: 'calls1', name: 'home/calls' })
            )
        );
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('parent_uid');
    });
});

describe('Tags page grouping', () => {
    beforeEach(() => {
        mockTags = [work, calls, urgent, home];
    });

    it('shows children by short name under their parent and collapses them', () => {
        render(
            <MemoryRouter>
                <Tags />
            </MemoryRouter>
        );

        const children = screen.getByTestId('tag-children-work1');
        expect(children).toHaveTextContent('calls');
        expect(children).toHaveTextContent('urgent');
        expect(children).not.toHaveTextContent('work/calls');

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
        mockTags = [urgent, calls, home, work];
        localStorage.setItem('sidebarSectionExpanded:tags', 'true');
    });

    afterEach(() => localStorage.clear());

    it('lists descendants after their parent by short name, indented by depth', () => {
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
            'urgent',
        ]);
        const indent = (uid: string) =>
            parseInt(screen.getByTestId(`sidebar-tag-${uid}`).style.paddingLeft);
        expect(indent('calls1')).toBeGreaterThan(indent('work1'));
        expect(indent('urgent1')).toBeGreaterThan(indent('calls1'));
        expect(screen.getByTestId('sidebar-tag-urgent1')).toHaveAttribute(
            'title',
            'work/calls/urgent'
        );
    });
});

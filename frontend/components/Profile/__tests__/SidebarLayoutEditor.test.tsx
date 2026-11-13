import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarLayoutEditor from '../SidebarLayoutEditor';
import { useStore } from '../../../store/useStore';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';
import {
    DEFAULT_LINK_ORDER,
    DEFAULT_SECTION_ORDER,
} from '../../../utils/sidebarLayout';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            if (typeof fallback !== 'string') return key;
            return fallback.replace(
                /\{\{(\w+)\}\}/g,
                (_: string, name: string) => options?.[name] ?? ''
            );
        },
    }),
}));

let dropHandlers: Array<(event: any) => void> = [];

jest.mock('@dnd-kit/core', () => {
    const actual = jest.requireActual('@dnd-kit/core');
    return {
        ...actual,
        DndContext: ({ children, onDragEnd }: any) => {
            dropHandlers.push(onDragEnd);
            return <>{children}</>;
        },
    };
});

const setFeatures = (features: Record<string, boolean>) =>
    act(() => {
        useStore.setState((state: any) => ({
            userSettingsStore: { ...state.userSettingsStore, ...features },
        }));
    });

const renderEditor = (
    props: Partial<React.ComponentProps<typeof SidebarLayoutEditor>> = {}
) => {
    const onToggleSection = jest.fn();
    const onReorder = jest.fn();
    render(
        <SidebarLayoutEditor
            visibleSections={{}}
            linkOrder={[...DEFAULT_LINK_ORDER]}
            sectionOrder={[...DEFAULT_SECTION_ORDER]}
            isAdmin={false}
            onToggleSection={onToggleSection}
            onReorder={onReorder}
            {...props}
        />
    );
    return { onToggleSection, onReorder };
};

const renderedIds = () =>
    screen
        .getAllByTestId(/^sidebar-preview-row-/)
        .map((row) =>
            row.getAttribute('data-testid')!.replace('sidebar-preview-row-', '')
        );

describe('SidebarLayoutEditor', () => {
    beforeEach(() => {
        dropHandlers = [];
        usePluginMenuStore.setState({ items: [], loaded: true });
        setFeatures({
            calendarEnabled: true,
            habitsEnabled: true,
            templatesEnabled: true,
            eisenhowerEnabled: true,
            kanbanEnabled: true,
            hasCollaborators: true,
        });
    });

    it('previews the whole sidebar in its default order', () => {
        renderEditor();

        expect(renderedIds()).toEqual([
            'favorites',
            ...DEFAULT_LINK_ORDER,
            ...DEFAULT_SECTION_ORDER.filter((id) => id !== 'favorites'),
            'templates',
        ]);
    });

    it('shows the links and sections in the saved order', () => {
        renderEditor({
            linkOrder: [
                'calendar',
                'today',
                'upcomingTasks',
                'allTasks',
                'assignedToMe',
                'everyone',
            ],
            sectionOrder: [
                'notes',
                'projects',
                ...DEFAULT_SECTION_ORDER.filter(
                    (id) => id !== 'notes' && id !== 'projects'
                ),
            ],
        });

        const ids = renderedIds();
        expect(ids.slice(0, 3)).toEqual(['favorites', 'calendar', 'today']);
        expect(ids.slice(7, 9)).toEqual(['notes', 'projects']);
    });

    it('has a switch on every row that reflects what is visible', () => {
        renderEditor({ visibleSections: { projects: false, calendar: false } });

        expect(
            screen.getByRole('switch', { name: 'Show Projects' })
        ).toHaveAttribute('aria-checked', 'false');
        expect(
            screen.getByRole('switch', { name: 'Show Calendar' })
        ).toHaveAttribute('aria-checked', 'false');
        expect(
            screen.getByRole('switch', { name: 'Show Notes' })
        ).toHaveAttribute('aria-checked', 'true');
        expect(screen.getAllByRole('switch')).toHaveLength(18);
    });

    it('reports the item when a switch is clicked', () => {
        const { onToggleSection } = renderEditor();

        fireEvent.click(screen.getByRole('switch', { name: 'Show Goals' }));
        fireEvent.click(screen.getByRole('switch', { name: 'Show Templates' }));

        expect(onToggleSection).toHaveBeenNthCalledWith(1, 'goals');
        expect(onToggleSection).toHaveBeenNthCalledWith(2, 'templates');
    });

    it('offers a move handle on links and sections but not on the fixed bottom items', () => {
        renderEditor({ isAdmin: true });

        expect(
            screen.getByRole('button', { name: 'Move Calendar' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Move Projects' })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Move Templates' })
        ).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Move Access' })
        ).toBeNull();
    });

    it('keeps pinned items fixed at the top: they can be hidden, not moved', () => {
        renderEditor();

        expect(
            screen.getByRole('switch', { name: 'Show Pinned' })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Move Pinned' })
        ).toBeNull();
    });

    it('shows Access only to admins', () => {
        const { unmount } = render(
            <SidebarLayoutEditor
                visibleSections={{}}
                linkOrder={[...DEFAULT_LINK_ORDER]}
                sectionOrder={[...DEFAULT_SECTION_ORDER]}
                isAdmin={false}
                onToggleSection={jest.fn()}
                onReorder={jest.fn()}
            />
        );
        expect(screen.queryByTestId('sidebar-preview-row-access')).toBeNull();
        unmount();

        renderEditor({ isAdmin: true });
        expect(
            screen.getByTestId('sidebar-preview-row-access')
        ).toBeInTheDocument();
    });

    it('marks rows whose feature is off', () => {
        setFeatures({
            calendarEnabled: false,
            habitsEnabled: false,
            templatesEnabled: false,
            eisenhowerEnabled: false,
            kanbanEnabled: false,
            hasCollaborators: false,
        });

        renderEditor();

        expect(screen.getAllByText('Off in Features')).toHaveLength(4);
        expect(screen.getByText('No collaborators')).toBeInTheDocument();
    });

    it('does not mark Boards when only one board is on', () => {
        setFeatures({ eisenhowerEnabled: false, kanbanEnabled: true });

        renderEditor();

        expect(screen.queryByText('Off in Features')).toBeNull();
    });

    it('does not draw divider lines between rows', () => {
        const { container } = render(
            <SidebarLayoutEditor
                visibleSections={{}}
                linkOrder={[...DEFAULT_LINK_ORDER]}
                sectionOrder={[...DEFAULT_SECTION_ORDER]}
                isAdmin
                onToggleSection={jest.fn()}
                onReorder={jest.fn()}
            />
        );

        expect(container.innerHTML).not.toMatch(/border-b|divide-y/);
    });

    describe('reordering', () => {
        it('reports the new order of the links after a drop', () => {
            const { onReorder } = renderEditor();

            act(() => {
                dropHandlers[0]({
                    active: { id: 'calendar' },
                    over: { id: 'upcomingTasks' },
                });
            });

            expect(onReorder).toHaveBeenCalledWith('links', [
                'today',
                'calendar',
                'upcomingTasks',
                'allTasks',
                'assignedToMe',
                'everyone',
            ]);
        });

        it('reports the new order of the sections after a drop', () => {
            const { onReorder } = renderEditor();

            act(() => {
                dropHandlers[1]({
                    active: { id: 'insights' },
                    over: { id: 'projects' },
                });
            });

            // Pinned items are fixed at the top and left out of the order.
            expect(onReorder).toHaveBeenCalledWith('sections', [
                'insights',
                'projects',
                ...DEFAULT_SECTION_ORDER.filter(
                    (id) =>
                        id !== 'insights' &&
                        id !== 'projects' &&
                        id !== 'favorites'
                ),
            ]);
        });

        it('ignores a drop on the same item or outside the list', () => {
            const { onReorder } = renderEditor();

            act(() => {
                dropHandlers[1]({
                    active: { id: 'notes' },
                    over: { id: 'notes' },
                });
                dropHandlers[1]({ active: { id: 'notes' }, over: null });
                dropHandlers[1]({
                    active: { id: 'notes' },
                    over: { id: 'nope' },
                });
            });

            expect(onReorder).not.toHaveBeenCalled();
        });
    });

    describe('plugin entries', () => {
        beforeEach(() => {
            usePluginMenuStore.setState({
                items: [
                    {
                        id: 'hermes',
                        label: 'Hermes',
                        path: '/plugins/hermes',
                        file: 'index.html',
                    },
                ],
                loaded: true,
            });
        });

        it('lists each running plugin after the built-in links', () => {
            renderEditor();

            expect(renderedIds().slice(0, 8)).toEqual([
                'favorites',
                ...DEFAULT_LINK_ORDER,
                'plugin:hermes',
            ]);
        });

        it('reports a plugin switch under its entry key', () => {
            const { onToggleSection } = renderEditor();

            fireEvent.click(
                screen.getByRole('switch', { name: 'Show Hermes' })
            );

            expect(onToggleSection).toHaveBeenCalledWith('plugin:hermes');
        });

        it('keeps a saved place for a plugin entry when a link is dragged', () => {
            const { onReorder } = renderEditor({
                linkOrder: ['plugin:hermes', ...DEFAULT_LINK_ORDER],
            });

            act(() => {
                dropHandlers[0]({
                    active: { id: 'calendar' },
                    over: { id: 'upcomingTasks' },
                });
            });

            expect(onReorder).toHaveBeenCalledWith('links', [
                'plugin:hermes',
                'today',
                'calendar',
                'upcomingTasks',
                'allTasks',
                'assignedToMe',
                'everyone',
            ]);
        });

        it('keeps the slot of a plugin that is off when saving the order', () => {
            const { onReorder } = renderEditor({
                linkOrder: ['plugin:gone', ...DEFAULT_LINK_ORDER],
            });

            act(() => {
                dropHandlers[0]({
                    active: { id: 'calendar' },
                    over: { id: 'upcomingTasks' },
                });
            });

            expect(onReorder).toHaveBeenCalledWith('links', [
                'plugin:gone',
                'today',
                'calendar',
                'upcomingTasks',
                'allTasks',
                'assignedToMe',
                'everyone',
                'plugin:hermes',
            ]);
        });
    });
});

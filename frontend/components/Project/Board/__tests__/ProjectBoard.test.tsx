import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectBoard from '../ProjectBoard';
import * as service from '../../../../utils/projectSectionsService';

jest.mock('../../../../utils/projectSectionsService');
jest.mock('../../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const mocked = service as jest.Mocked<typeof service>;

const t = ((key: string, fallback?: any, opts?: any) => {
    let text = typeof fallback === 'string' ? fallback : key;
    if (opts?.name) text = text.replace('{{name}}', opts.name);
    return text;
}) as any;

const sections = [
    { uid: 's1', name: 'Doing', position: 0 },
    { uid: 's2', name: 'Review', position: 1 },
];

const tasks = [
    { uid: 'a', name: 'Loose task', status: 0 },
    { uid: 'b', name: 'Busy task', status: 0, section_uid: 's1' },
] as any[];

const renderBoard = (onMoveTask = jest.fn().mockResolvedValue(undefined)) => {
    render(
        <ProjectBoard
            project={{ uid: 'p1', name: 'P' } as any}
            tasks={tasks}
            onMoveTask={onMoveTask}
            onOpenTask={jest.fn()}
            t={t}
        />
    );
    return onMoveTask;
};

describe('ProjectBoard', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mocked.fetchProjectSections.mockResolvedValue([...sections]);
    });

    it('shows an Unsectioned column and the sections with their tasks', async () => {
        renderBoard();
        expect(await screen.findByText('Doing')).toBeInTheDocument();
        expect(screen.getByText('Unsectioned')).toBeInTheDocument();
        expect(
            within(screen.getByTestId('board-column-none')).getByText(
                'Loose task'
            )
        ).toBeInTheDocument();
        expect(
            within(screen.getByTestId('board-column-s1')).getByText('Busy task')
        ).toBeInTheDocument();
    });

    it('adds a column at the end', async () => {
        mocked.createProjectSection.mockResolvedValue({
            uid: 's3',
            name: 'Done',
            position: 2,
        });
        renderBoard();
        await screen.findByText('Doing');
        mocked.fetchProjectSections.mockResolvedValue([
            ...sections,
            { uid: 's3', name: 'Done', position: 2 },
        ]);
        fireEvent.click(screen.getByTestId('board-add-column'));
        const input = screen.getByLabelText('Column name');
        fireEvent.change(input, { target: { value: 'Done' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() =>
            expect(mocked.createProjectSection).toHaveBeenCalledWith(
                'p1',
                'Done',
                undefined
            )
        );
        expect(await screen.findByText('Done')).toBeInTheDocument();
    });

    it('adds a column to the left of another', async () => {
        mocked.createProjectSection.mockResolvedValue({
            uid: 's3',
            name: 'New column',
            position: 1,
        });
        renderBoard();
        await screen.findByText('Doing');
        fireEvent.click(screen.getByTestId('board-menu-s2'));
        fireEvent.click(screen.getByText('Add column to the left'));
        await waitFor(() =>
            expect(mocked.createProjectSection).toHaveBeenCalledWith(
                'p1',
                'New column',
                1
            )
        );
    });

    it('renames a column', async () => {
        mocked.renameProjectSection.mockResolvedValue({
            uid: 's1',
            name: 'Now',
            position: 0,
        });
        renderBoard();
        await screen.findByText('Doing');
        fireEvent.click(screen.getByTestId('board-menu-s1'));
        fireEvent.click(screen.getByText('Rename'));
        const input = screen.getByLabelText('Column name');
        fireEvent.change(input, { target: { value: 'Now' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(await screen.findByText('Now')).toBeInTheDocument();
        expect(mocked.renameProjectSection).toHaveBeenCalledWith(
            'p1',
            's1',
            'Now'
        );
    });

    it('moves a column to the right', async () => {
        mocked.reorderProjectSections.mockResolvedValue([]);
        renderBoard();
        await screen.findByText('Doing');
        fireEvent.click(screen.getByTestId('board-menu-s1'));
        fireEvent.click(screen.getByText('Move right'));
        await waitFor(() =>
            expect(mocked.reorderProjectSections).toHaveBeenCalledWith('p1', [
                's2',
                's1',
            ])
        );
    });

    it('deletes a column after confirming', async () => {
        mocked.deleteProjectSection.mockResolvedValue(undefined);
        renderBoard();
        await screen.findByText('Doing');
        fireEvent.click(screen.getByTestId('board-menu-s1'));
        fireEvent.click(screen.getByText('Delete'));
        expect(
            screen.getByText('Delete "Doing"? Its tasks move to Unsectioned.')
        ).toBeInTheDocument();
        const dialogButtons = screen.getAllByRole('button', {
            name: 'Delete',
        });
        fireEvent.click(dialogButtons[dialogButtons.length - 1]);
        await waitFor(() =>
            expect(mocked.deleteProjectSection).toHaveBeenCalledWith('p1', 's1')
        );
        await waitFor(() =>
            expect(screen.queryByText('Doing')).not.toBeInTheDocument()
        );
    });

    it('drags a task into another column', async () => {
        const onMoveTask = renderBoard();
        await screen.findByText('Doing');
        const card = screen.getByTestId('board-card-a');
        const target = screen.getByTestId('board-column-s2');
        const dataTransfer = { setData: jest.fn(), effectAllowed: '' };
        await act(async () => {
            fireEvent.dragStart(card, { dataTransfer });
            fireEvent.dragOver(target, { dataTransfer });
            fireEvent.drop(target, { dataTransfer });
        });
        expect(onMoveTask).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'a' }),
            's2'
        );
    });

    const dataTransfer = () => ({ setData: jest.fn(), effectAllowed: '' });

    const renderWithOrder = (
        list: any[],
        extra: Record<string, unknown> = {}
    ) => {
        const onOrderColumn = jest.fn().mockResolvedValue(undefined);
        render(
            <ProjectBoard
                project={{ uid: 'p1', name: 'P' } as any}
                tasks={list}
                onMoveTask={jest.fn()}
                onOrderColumn={onOrderColumn}
                onOpenTask={jest.fn()}
                t={t}
                {...extra}
            />
        );
        return onOrderColumn;
    };

    const ordered = [
        { uid: 'x', name: 'X', status: 0, section_uid: 's1' },
        {
            uid: 'y',
            name: 'Y',
            status: 0,
            section_uid: 's1',
            section_position: 1,
        },
        {
            uid: 'z',
            name: 'Z',
            status: 0,
            section_uid: 's1',
            section_position: 0,
        },
    ];

    it('sorts cards by section_position, nulls last', async () => {
        renderWithOrder(ordered);
        await screen.findByText('Doing');
        const cards = within(screen.getByTestId('board-column-s1'))
            .getAllByTestId(/^board-card-/)
            .map((el) => el.textContent);
        expect(cards).toEqual(['Z', 'Y', 'X']);
    });

    it('reorders a card inside its column by dropping it on another card', async () => {
        const onOrderColumn = renderWithOrder(ordered);
        await screen.findByText('Doing');
        const dt = dataTransfer();
        await act(async () => {
            fireEvent.dragStart(screen.getByTestId('board-card-x'), {
                dataTransfer: dt,
            });
            fireEvent.dragOver(screen.getByTestId('board-card-z'), {
                dataTransfer: dt,
            });
            fireEvent.drop(screen.getByTestId('board-card-z'), {
                dataTransfer: dt,
            });
        });
        expect(onOrderColumn).toHaveBeenCalledWith('s1', ['x', 'z', 'y']);
    });

    it('drops a card at a chosen place in another column', async () => {
        const onOrderColumn = renderWithOrder([
            ...ordered,
            { uid: 'n', name: 'N', status: 0 },
        ]);
        await screen.findByText('Doing');
        const dt = dataTransfer();
        await act(async () => {
            fireEvent.dragStart(screen.getByTestId('board-card-n'), {
                dataTransfer: dt,
            });
            fireEvent.drop(screen.getByTestId('board-card-y'), {
                dataTransfer: dt,
            });
        });
        expect(onOrderColumn).toHaveBeenCalledWith('s1', ['z', 'n', 'y', 'x']);

        onOrderColumn.mockClear();
        await act(async () => {
            fireEvent.dragStart(screen.getByTestId('board-card-n'), {
                dataTransfer: dt,
            });
            fireEvent.drop(screen.getByTestId('board-column-s2'), {
                dataTransfer: dt,
            });
        });
        expect(onOrderColumn).toHaveBeenCalledWith('s2', ['n']);
    });

    it('drags a column onto another to reorder the columns', async () => {
        mocked.reorderProjectSections.mockResolvedValue([]);
        renderWithOrder(ordered);
        await screen.findByText('Doing');
        const dt = dataTransfer();
        await act(async () => {
            fireEvent.dragStart(screen.getByTestId('board-column-header-s2'), {
                dataTransfer: dt,
            });
            fireEvent.drop(screen.getByTestId('board-column-s1'), {
                dataTransfer: dt,
            });
        });
        expect(mocked.reorderProjectSections).toHaveBeenCalledWith('p1', [
            's2',
            's1',
        ]);
    });

    it('hides write controls and dragging for read-only viewers', async () => {
        const onOrderColumn = renderWithOrder(ordered, { readOnly: true });
        await screen.findByText('Doing');
        expect(screen.queryByTestId('board-add-column')).toBeNull();
        expect(screen.queryByTestId('board-menu-s1')).toBeNull();
        const card = screen.getByTestId('board-card-x');
        expect(card).toHaveAttribute('draggable', 'false');
        expect(screen.getByTestId('board-column-header-s1')).toHaveAttribute(
            'draggable',
            'false'
        );
        fireEvent.doubleClick(screen.getByText('Doing'));
        expect(screen.queryByLabelText('Column name')).toBeNull();
        const dt = dataTransfer();
        await act(async () => {
            fireEvent.dragStart(card, { dataTransfer: dt });
            fireEvent.drop(screen.getByTestId('board-column-s2'), {
                dataTransfer: dt,
            });
        });
        expect(onOrderColumn).not.toHaveBeenCalled();
    });
});

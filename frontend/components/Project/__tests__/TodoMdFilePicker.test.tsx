import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TodoMdFilePicker from '../TodoMdFilePicker';
import {
    fetchTodoMdFiles,
    linkTodoMdFile,
    unlinkTodoMdFile,
} from '../../../utils/todoMdService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));
const mockError = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: mockError }),
}));
jest.mock('../../../utils/todoMdService', () => ({
    fetchTodoMdFiles: jest.fn(),
    linkTodoMdFile: jest.fn(),
    unlinkTodoMdFile: jest.fn(),
}));

const files = [
    {
        folder: 'alpha',
        path: 'alpha/TODO.md',
        project_uid: 'p1',
        project_name: 'Alpha',
    },
    {
        folder: 'beta',
        path: 'beta/TODO.md',
        project_uid: 'p2',
        project_name: 'Other',
    },
    {
        folder: 'gamma',
        path: 'gamma/TODO.md',
        project_uid: null,
        project_name: null,
    },
];
const fetchMock = fetchTodoMdFiles as jest.Mock;
const linkMock = linkTodoMdFile as jest.Mock;
const unlinkMock = unlinkTodoMdFile as jest.Mock;

describe('TodoMdFilePicker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fetchMock.mockResolvedValue(files);
        linkMock.mockResolvedValue(undefined);
        unlinkMock.mockResolvedValue(undefined);
    });

    it('stays hidden when the server offers no file or refuses', async () => {
        fetchMock.mockRejectedValue(new Error('403'));
        const { container } = render(
            <TodoMdFilePicker projectUid="p3" onChanged={jest.fn()} />
        );
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the current file and disables one another project follows', async () => {
        render(
            <TodoMdFilePicker
                projectUid="p1"
                sourcePath="alpha/TODO.md"
                onChanged={jest.fn()}
            />
        );
        const select = (await screen.findByTestId(
            'todo-md-file'
        )) as HTMLSelectElement;
        expect(select.value).toBe('alpha');
        expect(
            (
                screen.getByRole('option', {
                    name: /beta\/TODO.md/,
                }) as HTMLOptionElement
            ).disabled
        ).toBe(true);
    });

    it('links a free file to a project without one', async () => {
        const onChanged = jest.fn();
        render(<TodoMdFilePicker projectUid="p3" onChanged={onChanged} />);
        fireEvent.change(await screen.findByTestId('todo-md-file'), {
            target: { value: 'gamma' },
        });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(unlinkMock).not.toHaveBeenCalled();
        expect(linkMock).toHaveBeenCalledWith('p3', 'gamma');
    });

    it('moves to another file, and detaches with None', async () => {
        const onChanged = jest.fn();
        render(
            <TodoMdFilePicker
                projectUid="p1"
                sourcePath="alpha/TODO.md"
                onChanged={onChanged}
            />
        );
        const select = await screen.findByTestId('todo-md-file');
        fireEvent.change(select, { target: { value: 'gamma' } });
        await waitFor(() =>
            expect(linkMock).toHaveBeenCalledWith('p1', 'gamma')
        );
        expect(unlinkMock).toHaveBeenCalledWith('p1');
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

        fireEvent.change(select, { target: { value: '' } });
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
        expect(unlinkMock).toHaveBeenCalledTimes(2);
    });

    it('says so when the change fails', async () => {
        linkMock.mockRejectedValue(new Error('409'));
        const onChanged = jest.fn();
        render(<TodoMdFilePicker projectUid="p3" onChanged={onChanged} />);
        fireEvent.change(await screen.findByTestId('todo-md-file'), {
            target: { value: 'gamma' },
        });
        await waitFor(() => expect(mockError).toHaveBeenCalled());
        expect(onChanged).toHaveBeenCalled();
    });
});

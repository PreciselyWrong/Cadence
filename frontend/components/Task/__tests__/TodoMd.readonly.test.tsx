import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodoMdTaskPanel from '../TodoMdTaskPanel';
import TodoMdProjectNote from '../../Project/TodoMdProjectNote';
import { isTodoMdProject, isTodoMdTask } from '../../../utils/todoMd';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            const text = typeof fallback === 'string' ? fallback : key;
            return options?.path
                ? text.replace('{{path}}', options.path)
                : text;
        },
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));

const showSuccessToast = jest.fn();
const showErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showSuccessToast, showErrorToast }),
}));

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: any) => <div data-testid="markdown">{content}</div>,
}));

describe('TODO.md read-only helpers', () => {
    it('recognises mirrored tasks and projects', () => {
        expect(isTodoMdTask({ source_key: 'abc' })).toBe(true);
        expect(isTodoMdTask({ source_key: null })).toBe(false);
        expect(isTodoMdTask(undefined)).toBe(false);
        expect(isTodoMdProject({ source_type: 'todo_md' })).toBe(true);
        expect(isTodoMdProject({ source_type: null })).toBe(false);
    });
});

describe('TodoMdTaskPanel', () => {
    const task = {
        uid: 't1',
        name: 'Ship the thing',
        status: 0,
        note: 'with a note',
        source_key: 'abc',
        source_section: 'Now',
    } as Task;

    it('shows the task read-only with its section and file badge', () => {
        render(<TodoMdTaskPanel isOpen onClose={jest.fn()} task={task} />);

        expect(screen.getByTestId('todo-md-task-panel')).toBeInTheDocument();
        expect(screen.getByTestId('todo-md-badge')).toBeInTheDocument();
        expect(screen.getByText('Now')).toBeInTheDocument();
        expect(screen.getByTestId('markdown')).toHaveTextContent('with a note');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
});

describe('TodoMdProjectNote', () => {
    it('shows the file path and rereads on demand', async () => {
        const onReread = jest.fn().mockResolvedValue(undefined);
        render(<TodoMdProjectNote path="alpha/TODO.md" onReread={onReread} />);

        expect(screen.getByText(/alpha\/TODO\.md/)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('todo-md-reread'));

        await screen.findByText('Reread');
        expect(onReread).toHaveBeenCalledTimes(1);
        expect(showSuccessToast).toHaveBeenCalledWith('TODO.md files reread.');
    });

    it('says so when the reread fails', async () => {
        const onReread = jest.fn().mockRejectedValue(new Error('no'));
        render(<TodoMdProjectNote path="alpha/TODO.md" onReread={onReread} />);

        fireEvent.click(screen.getByTestId('todo-md-reread'));

        await screen.findByText('Reread');
        expect(showErrorToast).toHaveBeenCalledWith(
            'Could not reread the TODO.md files.'
        );
    });
});

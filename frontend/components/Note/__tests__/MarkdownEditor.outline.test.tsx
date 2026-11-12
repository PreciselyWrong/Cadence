import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import MarkdownEditor from '../MarkdownEditor';
import { createTask } from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (_key: string, fallback: string, options?: Record<string, string>) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => options?.[k] ?? ''),
    }),
}));

const showSuccessToast = jest.fn();
const showErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast, showSuccessToast }),
}));

jest.mock('../../../store/useStore', () => {
    const state = {
        notesStore: {
            notes: [],
            hasLoaded: true,
            loadNotes: jest.fn(),
            addNote: jest.fn(),
        },
    };
    return {
        useStore: (selector: (s: typeof state) => unknown) => selector(state),
    };
});

jest.mock('../../../utils/notesService', () => ({ createNote: jest.fn() }));
jest.mock('../../../utils/peopleService', () => ({ fetchPeople: jest.fn() }));
jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(),
}));

const renderEditor = (value: string, taskProjectId?: number) => {
    const onChange = jest.fn();
    const { container } = render(
        <MemoryRouter>
            <MarkdownEditor
                value={value}
                onChange={onChange}
                outlineKey="note:n1"
                taskProjectId={taskProjectId}
            />
        </MemoryRouter>
    );
    const content = container.querySelector('.cm-content') as HTMLElement;
    const view = EditorView.findFromDOM(content)!;
    return { view, onChange, content };
};

describe('MarkdownEditor outliner', () => {
    beforeEach(() => {
        (createTask as jest.Mock).mockReset();
        showSuccessToast.mockReset();
        showErrorToast.mockReset();
    });

    it('Ctrl+Shift+T turns the bullet into a linked task of the note project', async () => {
        (createTask as jest.Mock).mockResolvedValue({ uid: 't1' });
        const { view, onChange } = renderEditor('- [ ] Call **Bob**\n- x', 7);
        act(() => view.dispatch({ selection: { anchor: 8 } }));
        await act(async () => {
            runScopeHandlers(
                view,
                new KeyboardEvent('keydown', {
                    key: 'T',
                    keyCode: 84,
                    ctrlKey: true,
                    shiftKey: true,
                }),
                'editor'
            );
        });
        expect(view.state.doc.toString()).toBe('- [ ] [[task:Call Bob]]\n- x');
        expect(onChange).toHaveBeenLastCalledWith(
            '- [ ] [[task:Call Bob]]\n- x'
        );
        expect(createTask).toHaveBeenCalledWith({
            name: 'Call Bob',
            project_id: 7,
        });
        expect(showSuccessToast).toHaveBeenCalledWith('Task created: Call Bob');
    });

    it('offers zoom, collapse and make a task on a bullet right-click', async () => {
        (createTask as jest.Mock).mockRejectedValue(new Error('down'));
        const { view, content } = renderEditor('- parent\n  - child');
        const bullet = content.querySelector('.cm-md-bullet')!;
        fireEvent.contextMenu(bullet, { clientX: 20, clientY: 30 });
        const items = screen
            .getAllByRole('menuitem')
            .map((el) => el.textContent);
        expect(items).toEqual([
            'Zoom inCtrl+.',
            'CollapseCtrl+↑',
            'Make a taskCtrl+Shift+T',
        ]);
        await act(async () => {
            fireEvent.click(screen.getByText('Make a task'));
        });
        expect(view.state.doc.toString()).toBe('- [[task:parent]]\n  - child');
        expect(createTask).toHaveBeenCalledWith({ name: 'parent' });
        expect(showErrorToast).toHaveBeenCalledWith(
            'Could not create the task.'
        );
    });

    it('shows a breadcrumb while zoomed in and goes back to all', () => {
        const { content } = renderEditor('- top\n  - mid\n    - leaf');
        const bullets = content.querySelectorAll('.cm-md-bullet');
        act(() => {
            bullets[1].dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, button: 0 })
            );
        });
        const crumbs = screen.getByTestId('outline-breadcrumb');
        expect(crumbs.textContent).toBe('All›top');
        act(() => {
            fireEvent.click(screen.getByText('All'));
        });
        expect(screen.queryByTestId('outline-breadcrumb')).toBeNull();
    });
});
